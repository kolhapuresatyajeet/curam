/// <reference lib="webworker" />
//
// Síle voice worker — hosts the two on-device ML models so the UI thread
// never freezes:
//   STT: Whisper (transformers.js, WebGPU with WASM fallback)
//   TTS: Kokoro-82M (kokoro-js, streaming sentence-by-sentence)
//
// Audio never leaves the device — the worker only ever sees Float32 PCM.

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

export type WorkerInbound =
  | { type: 'init' }
  | { type: 'transcribe'; reqId: number; pcm: Float32Array }
  | { type: 'speak'; reqId: number; text: string };

export type WorkerOutbound =
  | { type: 'ready'; sttDevice: string; ttsDevice: string }
  | { type: 'progress'; stage: 'stt' | 'tts'; file: string; progress: number }
  | { type: 'transcript'; reqId: number; text: string }
  | { type: 'speech'; reqId: number; seq: number; wav: ArrayBuffer; sampleRate: number }
  | { type: 'speech-done'; reqId: number }
  | { type: 'error'; scope: 'stt' | 'tts'; message: string };

const post = (msg: WorkerOutbound, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let tts: KokoroTTS | null = null;
let ready = false;

/** Encode Float32 PCM as a 16-bit WAV ArrayBuffer (transferred to the main thread). */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped > 0 ? clamped * 0x7fff : 0, true);
  }
  return buffer;
}

async function initStt(): Promise<string> {
  const onProgress = (data: { status: string; file?: string; progress?: number }) => {
    if (data.status === 'progress' && data.file) {
      post({ type: 'progress', stage: 'stt', file: data.file, progress: data.progress ?? 0 });
    }
  };
  // transformers.js overloads blow past TS2590 with many model types —
  // go through a flattened signature.
  const makePipeline = pipeline as unknown as (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>;

  // Probe for a usable GPU adapter FIRST. Chrome exposes navigator.gpu even
  // when it cannot grant an adapter (hardware acceleration off, VMs, old
  // builds) — attempting WebGPU then fails at ORT session init and poisons
  // the runtime so the WASM fallback fails with "no available backend found".
  let gpuOk = false;
  try {
    const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu) gpuOk = Boolean(await gpu.requestAdapter());
  } catch {
    gpuOk = false;
  }

  // Ladder: WebGPU + base → WASM + base (quantised) → WASM + tiny. Base
  // handles Irish accents better than tiny; quantised keeps downloads small.
  const attempts: { device: string; model: string; dtype: string; label: string }[] = [];
  if (gpuOk) attempts.push({ device: 'webgpu', model: 'Xenova/whisper-base', dtype: 'q4', label: 'webgpu' });
  attempts.push({ device: 'wasm', model: 'Xenova/whisper-base', dtype: 'q8', label: 'wasm' });
  attempts.push({ device: 'wasm', model: 'Xenova/whisper-tiny', dtype: 'q8', label: 'wasm-tiny' });

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      asr = await makePipeline('automatic-speech-recognition', attempt.model, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: onProgress,
      });
      return attempt.label;
    } catch (error) {
      lastError = error;
      // Ladder step-down is normal behaviour — keep it out of the UI.
      console.warn(`[sile-voice] STT backend "${attempt.label}" failed, trying next:`, error);
    }
  }
  throw lastError;
}

async function initTts(): Promise<string> {
  const onProgress = (data: { status: string; file?: string; progress?: number }) => {
    if (data.status === 'progress' && data.file) {
      post({ type: 'progress', stage: 'tts', file: data.file, progress: data.progress ?? 0 });
    }
  };
  try {
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: onProgress,
    });
    return 'kokoro-wasm';
  } catch (error) {
    // Main thread falls back to the browser's built-in speechSynthesis.
    post({ type: 'error', scope: 'tts', message: `Kokoro unavailable: ${String(error)}` });
    return 'os-voice';
  }
}

async function handleTranscribe(reqId: number, pcm: Float32Array) {
  if (!asr) throw new Error('STT not initialised');
  // Whisper runs at 16 kHz mono — exactly what the engine captures.
  const output = await asr(pcm, { language: 'en', task: 'transcribe' });
  const text = (Array.isArray(output) ? output[0]?.text : output?.text) ?? '';
  post({ type: 'transcript', reqId, text: text.trim() });
}

let speakSeq = 0;
async function handleSpeak(reqId: number, text: string) {
  if (!tts) throw new Error('TTS not initialised');
  const seq = ++speakSeq;
  const splitter = new TextSplitterStream();
  const stream = tts.stream(splitter, { voice: 'af_heart', speed: 1.02 });
  // Feed the whole reply, then close — the stream yields one chunk per
  // sentence so playback can start before generation finishes.
  splitter.push(text);
  splitter.close();
  let sent = 0;
  for await (const chunk of stream) {
    const wav = encodeWav(chunk.audio.audio as Float32Array, chunk.audio.sampling_rate);
    post({ type: 'speech', reqId, seq: sent++, wav, sampleRate: chunk.audio.sampling_rate }, [wav]);
  }
  post({ type: 'speech-done', reqId });
}

(self as unknown as DedicatedWorkerGlobalScope).onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      if (ready) {
        post({ type: 'ready', sttDevice: 'already', ttsDevice: 'already' });
        return;
      }
      const sttDevice = await initStt();
      const ttsDevice = await initTts();
      ready = true;
      post({ type: 'ready', sttDevice, ttsDevice });
      return;
    }
    if (msg.type === 'transcribe') {
      await handleTranscribe(msg.reqId, msg.pcm);
      return;
    }
    if (msg.type === 'speak') {
      await handleSpeak(msg.reqId, msg.text);
      return;
    }
  } catch (error) {
    const scope = msg.type === 'speak' ? 'tts' : 'stt';
    post({ type: 'error', scope, message: String(error) });
  }
};
