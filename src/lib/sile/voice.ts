//
// Síle voice engine — main-thread half of the on-device voice loop.
//
// Push-to-talk with auto-stop on silence for Phase 1 (Silero hands-free VAD
// lands in Phase 2). Speech -> Whisper in the worker -> transcript callback;
// replies -> Kokoro in the worker -> streamed WAV playback, with the
// browser's built-in speechSynthesis as the zero-download fallback.
//
// No audio ever leaves the device: the only network traffic is the one-time
// model download from the Hugging Face CDN (cached by the browser after that).
// (Premium ElevenLabs TTS is the one exception — Phase 3, behind the
// silePremiumVoice flag, and off by default until the EU-residency review.)

import { chunkForTts, fetchPremiumChunk, premiumVoiceEnabled } from './premium-voice';

export type SileVoiceState = 'idle' | 'loading' | 'listening' | 'transcribing' | 'speaking';

export type SileVoiceCallbacks = {
  onState: (state: SileVoiceState) => void;
  onTranscript: (text: string) => void;
  onModelInfo: (info: { sttDevice?: string; ttsDevice?: string; ttsFallback: boolean }) => void;
  onError: (message: string) => void;
  onListeningChange: (listening: boolean) => void;
};

const SAMPLE_RATE = 16_000;
const SILENCE_MS = 1_600; // how long to wait after speech stops before finalising
const MIN_SPEECH_MS = 400; // ignore clicks/breath
const MAX_UTTERANCE_MS = 15_000;
const RMS_THRESHOLD = 0.012; // mic noise floor gate

// OS-voice fallback — picked ONCE and cached so the browser voice never
// changes between commands (getVoices() populates asynchronously, and
// re-picking per utterance made the voice jump mid-conversation).
let cachedOsVoice: SpeechSynthesisVoice | null = null;

function pickOsVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return voices.find((v) => /en-(IE|GB)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedOsVoice = pickOsVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedOsVoice = cachedOsVoice ?? pickOsVoice();
  };
}

type QueuedSpeech = { wav: ArrayBuffer; sampleRate: number };

export class SileVoice {
  private worker: Worker;
  private callbacks: SileVoiceCallbacks;
  private state: SileVoiceState = 'idle';

  private audioContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private frames: Float32Array[] = [];
  private speechFrames: Float32Array[] = [];
  private inSpeech = false;
  private lastVoiceAt = 0;
  private utteranceStart = 0;
  private listening = false;

  private reqCounter = 0;
  private pendingTranscribe = new Set<number>();
  private speakQueue: QueuedSpeech[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private osVoiceFallback = false;
  private kokoroReady = false;
  /** True while Síle is talking (or just finished) — mic frames are discarded. */
  private muted = false;
  /** Bumped on every speak()/stopSpeaking() — async premium-TTS fetches and
   *  grace-period unmutes check it so a barge-in can never be talked over. */
  private speakGen = 0;

  constructor(callbacks: SileVoiceCallbacks) {
    this.callbacks = callbacks;
    this.worker = new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent) => this.onWorkerMessage(event.data);
    this.worker.onerror = (event) => this.callbacks.onError(`Voice worker failed: ${event.message}`);
  }

  private setState(next: SileVoiceState) {
    this.state = next;
    this.callbacks.onState(next);
  }

  getState(): SileVoiceState {
    return this.state;
  }

  private onWorkerMessage(msg: {
    type: string;
    sttDevice?: string;
    ttsDevice?: string;
    stage?: string;
    file?: string;
    reqId?: number;
    text?: string;
    wav?: ArrayBuffer;
    sampleRate?: number;
    scope?: string;
    message?: string;
  }) {
    switch (msg.type) {
      case 'ready':
        this.kokoroReady = msg.ttsDevice === 'kokoro-wasm';
        this.callbacks.onModelInfo({ sttDevice: msg.sttDevice, ttsDevice: msg.ttsDevice, ttsFallback: !this.kokoroReady });
        break;
      case 'transcript':
        if (typeof msg.reqId === 'number') this.pendingTranscribe.delete(msg.reqId);
        if (this.state === 'transcribing') this.setState('idle');
        // Push-to-talk semantics: one command per tap. Stop the mic before
        // processing so Síle's spoken reply can never be fed back in.
        this.stopListening();
        const text = (msg.text ?? '').trim();
        if (isRealSpeech(text)) this.callbacks.onTranscript(text);
        break;
      case 'speech':
        if (msg.wav && msg.sampleRate) {
          this.speakQueue.push({ wav: msg.wav, sampleRate: msg.sampleRate });
          void this.playNextChunk();
        }
        break;
      case 'error':
        if (msg.scope === 'tts') {
          // Kokoro failed — permanently fall back to OS voices.
          this.osVoiceFallback = true;
          this.callbacks.onModelInfo({ ttsFallback: true });
        }
        this.callbacks.onError(msg.message ?? 'Voice engine error');
        break;
      default:
        break;
    }
  }

  /** Kick off model download in the background (safe to call repeatedly). */
  warmUp() {
    this.worker.postMessage({ type: 'init' });
  }

  async startListening() {
    if (this.listening) return;
    this.warmUp(); // no-op after first call
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    await this.audioContext.resume();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but universally supported and fine for a
    // low-duty-cycle capture loop; AudioWorklet upgrade comes with Phase 2 VAD.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => this.onAudioFrame(event.inputBuffer.getChannelData(0));
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination); // required for Safari to pump frames
    this.frames = [];
    this.speechFrames = [];
    this.inSpeech = false;
    this.listening = true;
    this.callbacks.onListeningChange(true);
    this.setState('listening');
  }

  stopListening() {
    if (!this.listening) return;
    this.listening = false;
    this.callbacks.onListeningChange(false);
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.muted = false;
    if (this.state === 'listening') this.setState('idle');
    // If speech was mid-flight but below finalisation threshold, drop it —
    // a deliberate stop tap means "forget that".
    this.frames = [];
    this.speechFrames = [];
  }

  private onAudioFrame(frame: Float32Array) {
    if (!this.listening || this.muted) return;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const now = Date.now();

    if (rms > RMS_THRESHOLD) {
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.utteranceStart = now;
        this.speechFrames = [];
      }
      this.lastVoiceAt = now;
      this.speechFrames.push(frame.slice());
    } else if (this.inSpeech) {
      this.speechFrames.push(frame.slice());
      const silenceFor = now - this.lastVoiceAt;
      const spoken = now - this.utteranceStart;
      if ((silenceFor > SILENCE_MS && spoken > MIN_SPEECH_MS) || spoken > MAX_UTTERANCE_MS) {
        this.finaliseUtterance();
      }
    }
  }

  private finaliseUtterance() {
    const pcm = concatFrames(this.speechFrames);
    this.speechFrames = [];
    this.inSpeech = false;
    if (pcm.length < SAMPLE_RATE * 0.3) return;
    const reqId = ++this.reqCounter;
    this.pendingTranscribe.add(reqId);
    this.setState('transcribing');
    const copy = new Float32Array(pcm); // transferable copy
    this.worker.postMessage({ type: 'transcribe', reqId, pcm: copy }, [copy.buffer]);
  }

  /** Manually finish the current utterance (e.g. user taps stop). */
  flush() {
    if (this.inSpeech) this.finaliseUtterance();
    this.stopListening();
  }

  /** Speak a reply. Mutes the mic while she talks so she never hears herself. */
  speak(text: string) {
    this.muted = true;
    this.speakGen++;
    if (premiumVoiceEnabled()) {
      void this.speakWithPremiumVoice(text);
      return;
    }
    if (this.osVoiceFallback || !this.kokoroReady) {
      this.speakWithOsVoice(text);
      return;
    }
    this.speakViaKokoro(text);
  }

  /** Existing worker path — Kokoro streams sentence chunks from the worker. */
  private speakViaKokoro(text: string) {
    const reqId = ++this.reqCounter;
    const gen = this.speakGen;
    this.setState('speaking');
    this.worker.postMessage({ type: 'speak', reqId, text });
    // If the worker TTS silently never produces audio, clear the state;
    // a watchdog keeps the UI honest.
    window.setTimeout(() => {
      if (gen === this.speakGen && this.state === 'speaking' && this.speakQueue.length === 0 && !this.currentSource) this.setState('idle');
    }, 3000);
  }

  /** ElevenLabs path (feature-flagged): the first sentence chunk starts
   *  playing while later chunks are still downloading — same pipelining as
   *  the Kokoro path. Any failure degrades to the on-device stack silently. */
  private async speakWithPremiumVoice(text: string) {
    this.stopSpeaking(); // clear anything mid-flight (also bumps speakGen)
    // Capture AFTER stopSpeaking — the guard below detects *external*
    // supersession (a barge-in or newer utterance), not our own teardown.
    const gen = this.speakGen;
    this.muted = true;
    this.setState('speaking');

    let premiumOk = false;
    for (const chunk of chunkForTts(text)) {
      const audio = await fetchPremiumChunk(chunk);
      if (gen !== this.speakGen) return; // barge-in / new utterance won
      if (!audio) break;
      premiumOk = true;
      this.speakQueue.push({ wav: audio, sampleRate: 44100 }); // decodeAudioData sniffs MP3
      void this.playNextChunk();
    }
    if (!premiumOk) {
      // No ElevenLabs audio at all (no key, offline, 5xx) — on-device stack.
      if (this.osVoiceFallback || !this.kokoroReady) {
        this.speakWithOsVoice(text);
        return;
      }
      this.speakViaKokoro(text);
      return;
    }
    // Watchdog, same as the Kokoro path.
    window.setTimeout(() => {
      if (gen === this.speakGen && this.state === 'speaking' && this.speakQueue.length === 0 && !this.currentSource) this.setState('idle');
    }, 3000);
  }

  stopSpeaking() {
    this.speakQueue = [];
    this.speakGen++; // invalidate pending premium fetches + grace unmutes
    this.muted = false;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }
    window.speechSynthesis?.cancel();
    if (this.state === 'speaking') this.setState('idle');
  }

  private async playNextChunk() {
    if (this.currentSource || !this.speakQueue.length) return;
    const chunk = this.speakQueue.shift();
    if (!chunk) return;
    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      this.playbackContext = new AudioContext();
    }
    await this.playbackContext.resume();
    const buffer = await this.playbackContext.decodeAudioData(chunk.wav.slice(0));
    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    const gen = this.speakGen;
    source.onended = () => {
      this.currentSource = null;
      if (this.speakQueue.length) void this.playNextChunk();
      else {
        // Brief grace period so speaker tail-off never reaches the mic —
        // cancelled if a newer utterance or barge-in superseded this one.
        window.setTimeout(() => {
          if (gen !== this.speakGen) return;
          this.muted = false;
          if (this.state === 'speaking') this.setState('idle');
        }, 300);
      }
    };
    source.connect(this.playbackContext.destination);
    source.start();
    this.currentSource = source;
  }

  private speakWithOsVoice(text: string) {
    if (!('speechSynthesis' in window)) return;
    this.stopSpeaking();
    const gen = this.speakGen;
    this.setState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    // Same cached voice every time — stable identity across commands.
    if (cachedOsVoice) utterance.voice = cachedOsVoice;
    const done = () => {
      window.setTimeout(() => {
        if (gen !== this.speakGen) return;
        this.muted = false;
        if (this.state === 'speaking') this.setState('idle');
      }, 300);
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  }

  dispose() {
    this.stopListening();
    this.stopSpeaking();
    this.worker.terminate();
    void this.audioContext?.close();
    void this.playbackContext?.close();
  }
}

function concatFrames(frames: Float32Array[]): Float32Array {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

/**
 * Whisper hallucinates artifacts on silence/speaker-bleed ("[BLANK_AUDIO]",
 * "(inaudible)") — those are not commands, so drop them.
 */
export function isRealSpeech(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^[[(](?:\s*(?:blank[_\s-]?audio|inaudible|silence|music|applause|noise|pause)\s*)[\])]$/i.test(trimmed)) return false;
  if (/^[[(].*[\])]$/.test(trimmed)) return false; // any fully bracketed tag
  if (!/[a-z\u00c0-\u024f]/i.test(trimmed)) return false; // must contain letters
  return true;
}
