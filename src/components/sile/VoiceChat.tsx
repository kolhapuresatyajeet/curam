import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { AppButton } from '@/components/shared/ui';
import { useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';
import { executeSileCommand } from '@/lib/sile/intents';
import { chatWithSile } from '@/lib/sile-chat';
import { SileVoice, type SileVoiceState } from '@/lib/sile/voice';

type ChatEntry = { role: 'user' | 'sile'; text: string; at: string };

const CHIP_COMMANDS = (firstPatient?: string) => [
  'Read me my day',
  "Who's waiting?",
  'Open patients',
  ...(firstPatient ? [`Open ${firstPatient}`, `What did we decide last time for ${firstPatient}?`] : []),
];

const STATE_LABEL: Record<SileVoiceState, string> = {
  idle: 'Tap the mic and speak — or type below',
  loading: 'Warming up on-device models…',
  listening: 'Listening…',
  transcribing: 'Understanding…',
  speaking: 'Síle is speaking…',
};

/** Phase-1 Síle conversation panel: on-device voice loop + local intents. */
export default function VoiceChat() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  const [log, setLog] = useState<ChatEntry[]>([]);
  const [voiceState, setVoiceState] = useState<SileVoiceState>('idle');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<{ sttDevice?: string; ttsDevice?: string; ttsFallback: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  /** No GPU adapter on this device → Síle will always be on the slow path. */
  const [gpuUnavailable, setGpuUnavailable] = useState(false);

  const voiceRef = useRef<SileVoice | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const logRef = useRef<HTMLDivElement | null>(null);
  const runCommandRef = useRef<(text: string, source: 'voice' | 'typed') => Promise<void>>(async () => {});

  const pushEntry = useCallback((entry: ChatEntry) => {
    setLog((current) => [...current, entry]);
  }, []);

  // Capability probe on mount — cheap, no models involved. Tells us straight
  // away whether the fast (WebGPU) path is even possible on this device, so
  // the speed tip can show before any voice is used.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
        if (!gpu) {
          if (!cancelled) setGpuUnavailable(true);
          return;
        }
        const adapter = await gpu.requestAdapter();
        if (!cancelled && !adapter) setGpuUnavailable(true);
      } catch {
        if (!cancelled) setGpuUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const voice = new SileVoice({
      onState: setVoiceState,
      onTranscript: (text) => runCommandRef.current(text, 'voice'),
      onModelInfo: setModelInfo,
      onError: (message) => setError(`${message} — voice may be unavailable on this device; the typed box below always works.`),
      onListeningChange: setListening,
    });
    voiceRef.current = voice;
    return () => {
      voice.dispose();
      voiceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const runCommand = useCallback(
    async (text: string, source: 'voice' | 'typed') => {
      const trimmed = text.trim();
      if (!trimmed) return;
      pushEntry({ role: 'user', text: trimmed, at: new Date().toISOString() });
      const result = executeSileCommand(trimmed, stateRef.current);
      let reply = result.reply;
      if (result.navigate) setLocation(result.navigate);
      if (result.matched) {
        pushEntry({ role: 'sile', text: reply, at: new Date().toISOString() });
      } else {
        // Local brain didn't match — try the server chat (Claude, EU) with
        // the recent conversation for context; fall back to the local reply.
        pushEntry({ role: 'sile', text: '…thinking', at: new Date().toISOString() });
        const history = log
          .slice(-8)
          .map((entry) => ({ role: entry.role === 'user' ? ('user' as const) : ('assistant' as const), content: entry.text }));
        const chat = await chatWithSile(history, { route: 'sile' });
        reply = chat.ok ? chat.reply : result.reply;
        if (!chat.ok && chat.error) setError(chat.error);
        setLog((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last && last.text === '…thinking') next[next.length - 1] = { ...last, text: reply };
          return next;
        });
      }
      // Spoken acknowledgement — even when navigating, so the GP hears it worked.
      voiceRef.current?.speak(reply);
      void source;
    },
    [pushEntry, setLocation, log],
  );
  runCommandRef.current = runCommand;

  const toggleMic = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice) return;
    setError(null);
    try {
      if (listening) {
        voice.flush();
        return;
      }
      voice.stopSpeaking(); // barge-in: talking over Síle stops her
      await voice.startListening();
    } catch (micError) {
      setError(`Microphone unavailable: ${String(micError)}`);
    }
  }, [listening]);

  const submitTyped = useCallback(() => {
    if (!typed.trim()) return;
    runCommand(typed, 'typed');
    setTyped('');
  }, [runCommand, typed]);

  const chips = useMemo(() => {
    const first = state.patients[0] ? patientName(state.patients[0]) : undefined;
    return CHIP_COMMANDS(first);
  }, [state.patients]);

  const busy = voiceState === 'transcribing';
  const speaking = voiceState === 'speaking';

  return (
    <div className="surface rounded-xl">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`icon-box ${speaking ? 'icon-purple' : listening ? 'icon-coral' : 'icon-teal'}`}>
            <Sparkles size={15} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Talk to Síle</p>
            <p className="text-[11px] text-slate-500">
              {STATE_LABEL[voiceState]}
              {modelInfo?.sttDevice ? ` · ears: ${modelInfo.sttDevice}` : ''}
              {modelInfo ? ` · voice: ${modelInfo.ttsFallback ? 'browser' : 'Kokoro'}` : ''}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {speaking && (
            <AppButton size="sm" variant="ghost" onClick={() => voiceRef.current?.stopSpeaking()}>
              <VolumeX size={13} /> Stop voice
            </AppButton>
          )}
          <AppButton size="sm" variant={listening ? 'danger' : 'primary'} onClick={() => void toggleMic()} disabled={busy}>
            {listening ? <MicOff size={13} /> : <Mic size={13} />}
            {listening ? 'Stop' : 'Speak'}
          </AppButton>
        </div>
      </div>

      {/* Speed tip — only when she is on the battery-saving (non-GPU) path. */}
      {(gpuUnavailable || modelInfo?.sttDevice?.startsWith('wasm')) && (
        <p className="border-b border-slate-100 bg-amber-50/60 px-4 py-2 text-[11px] leading-5 text-amber-800">
          💡 Síle is running in her battery-saving mode — she works fine, just a little slower. To let her use your
          computer's full speed: in Chrome open <strong>Settings → System</strong> and turn on{' '}
          <strong>“Use graphics acceleration when available”</strong>, then restart Chrome. She switches to fast mode
          automatically — no updates needed.
        </p>
      )}

      {/* Quick commands */}
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => runCommand(chip, 'typed')}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Conversation log */}
      <div ref={logRef} className="max-h-80 min-h-40 space-y-2 overflow-y-auto px-4 py-3">
        {log.length === 0 && (
          <p className="py-6 text-center text-[12px] text-slate-500">
            Everything runs on this device — your voice never leaves the browser. Say things like “read me my day”,
            “who’s waiting”, or “open Mary Byrne’s record”.
          </p>
        )}
        {log.map((entry, index) => (
          <div key={`${entry.at}-${index}`} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-5 ${
                entry.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {entry.role === 'sile' && (
                <span className="mr-1 inline-flex items-center gap-1 font-semibold text-purple-700">
                  <Volume2 size={11} /> Síle:
                </span>
              )}
              {entry.text}
            </div>
          </div>
        ))}
        {listening && (
          <div className="flex justify-end">
            <div className="flex items-center gap-1 rounded-2xl bg-teal-50 px-3 py-2">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="sile-dot h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" style={{ animationDelay: `${dot * 200}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-[#b5443b]" role="alert">
          {error}
        </p>
      )}

      {/* Typed fallback */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submitTyped()}
          placeholder="Or type a command…"
          className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-purple-400"
        />
        <AppButton size="sm" onClick={submitTyped} disabled={!typed.trim()}>
          <Send size={13} /> Send
        </AppButton>
      </div>
    </div>
  );
}
