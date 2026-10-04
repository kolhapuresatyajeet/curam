import { Mic, Volume2, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';
import VoiceChat, { type SilePatientContext } from '@/components/sile/VoiceChat';
import { setVoiceWidgetOpen, useVoiceWidgetState } from '@/components/sile/voiceWidget';

/**
 * Global "Talk to Síle" voice widget — mounted ONCE in the app shell so the
 * conversation, the on-device models and the mic survive navigation (e.g. Síle
 * opening a patient record mid-command, then briefing on them from there).
 * The modal is kept mounted (hidden with CSS, not unmounted) so the chat log
 * persists; closing it stops the mic and playback for privacy. Opening it
 * starts the mic straight away — one tap and you're talking.
 */
export default function SileVoiceWidget() {
  const widget = useVoiceWidgetState();
  const open = widget.open;
  const setOpen = (next: boolean) => setVoiceWidgetOpen(next);
  const state = useAppState();
  const [location] = useLocation();

  // Patient context follows the GP: while on a patient record, commands like
  // "brief me" and "show her labs" automatically refer to that patient.
  const match = location.match(/^\/patients\/([^/]+)/);
  const patient = match ? state.patients.find((p) => p.id === match[1]) : undefined;
  const patientContext: SilePatientContext | undefined = patient
    ? { patientId: patient.id, patientName: patientName(patient) }
    : undefined;

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Talk to Síle"
          onClick={() => setOpen(true)}
          className="fixed bottom-[4.75rem] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-purple-700 text-white shadow-lg transition hover:bg-purple-800"
        >
          <Mic size={19} />
        </button>
      )}

      {/* Hidden with CSS (not unmounted) so the conversation survives close/reopen. */}
      <div
        className={`fixed bottom-5 right-5 z-50 flex h-[560px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${open ? '' : 'hidden'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="icon-box icon-purple">
              <Volume2 size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Talk to Síle</p>
              <p className="text-[10px] text-slate-400">
                {patient ? `Patient: ${patientContext?.patientName}` : 'Voice · follows you around Cúram'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close voice"
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <VoiceChat patientContext={patientContext} hidden={!open} listenToken={widget.listenPulse} />
        </div>
      </div>
    </>
  );
}
