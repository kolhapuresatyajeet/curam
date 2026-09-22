import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { AppButton, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { draftSoapFromTranscript, suggestIcpc2 } from '@/lib/ai-scribe';
import { id, nowIso } from '@/lib/utils';
import { consultationStore, useConsultationStore } from '@/stores/consultationStore';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import type { Consultation, ConsultationTemplate } from '@/types/domain';

const TEMPLATES: { id: ConsultationTemplate; label: string }[] = [
  { id: 'gp_consult', label: 'GP consult' },
  { id: 'phone_triage', label: 'Phone triage' },
  { id: 'nurse_clinic', label: 'Nurse clinic' },
  { id: 'home_visit', label: 'Home visit' },
];

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const state = useAppState();
  const staff = useSessionStaff();
  const ui = useConsultationStore();
  const patient = state.patients.find((item) => item.id === params.id);

  const existing = useMemo(() => {
    const match = window.location.search.match(/id=([^&]+)/);
    if (match) return state.consultations.find((item) => item.id === match[1]);
    return state.consultations.find((item) => item.patientId === params.id && item.status === 'draft');
  }, [state.consultations, params.id]);

  const [note, setNote] = useState<Consultation>(() => existing ?? {
    id: id('con'),
    patientId: params.id ?? '',
    staffId: staff?.id ?? '',
    templateType: 'gp_consult',
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    icpc2Codes: [],
    aiScribeUsed: false,
    aiTranscript: '',
    status: 'draft',
    createdAt: nowIso(),
  });

  if (!patient || !staff) return null;

  function patch(partial: Partial<Consultation>) {
    setNote((current) => ({ ...current, ...partial }));
  }

  return (
    <div className="fade-in grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <SectionTitle title={`Consultation · ${patient.firstName} ${patient.lastName}`} description="SOAP note. AI drafts require your approval before they are written into the record." />
        <div className="mb-3 flex flex-wrap gap-2">
          {TEMPLATES.map((item) => (
            <button key={item.id} type="button" onClick={() => patch({ templateType: item.id })} className={`rounded-md px-3 py-1.5 text-[11px] ${note.templateType === item.id ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="surface space-y-3 rounded-xl p-4">
          {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
            <Field key={field} label={field.toUpperCase()}>
              <textarea className={`${inputClass} h-24 py-2`} value={note[field]} onChange={(e) => patch({ [field]: e.target.value })} />
            </Field>
          ))}
          <div className="text-[11px] text-slate-500">ICPC-2: {note.icpc2Codes.join(', ') || '—'}</div>
          <div className="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              onClick={() => {
                appStore.saveConsultation(note);
              }}
            >
              Save draft
            </AppButton>
            <AppButton
              size="sm"
              variant="primary"
              onClick={() => {
                const signed = { ...note, status: 'signed' as const, signedAt: nowIso(), staffId: staff.id };
                appStore.saveConsultation(signed);
                setLocation(`/patients/${patient.id}`);
              }}
            >
              Sign note
            </AppButton>
          </div>
        </div>
      </div>
      <aside className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-800">AI scribe</h2>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={ui.consent} onChange={(e) => consultationStore.setConsent(e.target.checked)} />
          Patient consent for recording
        </label>
        <AppButton
          size="sm"
          disabled={!ui.consent}
          onClick={() => {
            consultationStore.setRecording(!ui.recording);
            if (!ui.recording) {
              patch({
                aiTranscript:
                  note.aiTranscript ||
                  'Patient describes tiredness and increased thirst. Blood pressure mentioned as high at home. No chest pain or breathing difficulty.',
              });
            }
          }}
        >
          {ui.recording ? 'Stop capture' : 'Start capture'}
        </AppButton>
        <textarea className={`${inputClass} mt-3 h-40 py-2`} value={note.aiTranscript} onChange={(e) => patch({ aiTranscript: e.target.value })} placeholder="Live transcript" />
        <AppButton
          size="sm"
          variant="primary"
          onClick={() => {
            appStore.saveConsultation({ ...note, aiScribeUsed: true });
            const result = appStore.generateAiSoap(note.id, note.aiTranscript, patient.id);
            const draft = result.draft ?? draftSoapFromTranscript(note.aiTranscript, '');
            patch({ aiDraftNote: draft, icpc2Codes: result.codes ?? suggestIcpc2(note.aiTranscript), aiScribeUsed: true });
          }}
        >
          Structure SOAP
        </AppButton>
        {note.aiDraftNote && (
          <div className="mt-3 rounded-lg bg-teal-50 p-3 text-[11px] text-slate-600">
            <p className="font-semibold">AI draft (unapproved)</p>
            <p className="mt-1">{note.aiDraftNote.assessment}</p>
            <AppButton
              size="sm"
              onClick={() => {
                patch({
                  subjective: note.aiDraftNote?.subjective ?? note.subjective,
                  objective: note.aiDraftNote?.objective ?? note.objective,
                  assessment: note.aiDraftNote?.assessment ?? note.assessment,
                  plan: note.aiDraftNote?.plan ?? note.plan,
                });
                appStore.approveAiNote(note.id);
              }}
            >
              Approve into note
            </AppButton>
          </div>
        )}
      </aside>
    </div>
  );
}
