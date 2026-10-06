import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { AppButton, EmptyState, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { audioFilename, draftSoapFromTranscript, draftSummaryFromTranscript, structureSoapRemote, suggestIcpc2, transcribeSegment } from '@/lib/ai-scribe';
import { transcribeLocal } from '@/lib/local-scribe';
import { id, nowIso } from '@/lib/utils';
import { consultationStore, useConsultationStore } from '@/stores/consultationStore';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { CONSULTATION_TEMPLATES } from '@/lib/consultation-templates';
import { canApprovePrescriptions } from '@/lib/permissions';
import { insertPrescription, insertReferral } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import type { Consultation } from '@/types/domain';

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const state = useAppState();
  const staff = useSessionStaff();
  const ui = useConsultationStore();
  const patient = state.patients.find((item) => item.id === params.id);
  // Live transcription: the recorder is rolled every SEGMENT_MS so each
  // segment is a self-contained webm file (timeslice chunks alone lack the
  // webm header and cannot be decoded individually). Completed segments are
  // transcribed in order while the GP is still talking.
  const SEGMENT_MS = 30_000;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingActiveRef = useRef(false);
  const segmentTimerRef = useRef<number | null>(null);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const segmentIndexRef = useRef(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingSegments, setPendingSegments] = useState(0);
  const [structuring, setStructuring] = useState(false);
  const [scribeError, setScribeError] = useState('');
  // Offline (free) tier — active when the practice's monthly AI budget is
  // exhausted: one continuous recording transcribed on-device by Whisper.
  const offlineChunksRef = useRef<Blob[]>([]);
  const [offlineBlob, setOfflineBlob] = useState<Blob | null>(null);
  const [localTranscribing, setLocalTranscribing] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  // True when the practice's monthly AI budget is exhausted — the note stays
  // fully writable by hand; AI capture/structuring is paused until next month.
  const [budgetReached, setBudgetReached] = useState(false);

  // Leaving the page mid-recording stops the mic, the segment timer and
  // in-flight segment transcription cleanly.
  useEffect(() => () => {
    recordingActiveRef.current = false;
    if (segmentTimerRef.current !== null) window.clearInterval(segmentTimerRef.current);
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const existing = useMemo(() => {
    if (window.location.search.includes('new=1')) return undefined; // "New SOAP note" — start blank
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

  if (!patient) {
    return (
      <div className="fade-in">
        <SectionTitle title="Consultation" />
        <EmptyState
          title="No patient selected"
          detail="Open a patient from the Patients list to start or continue a consultation."
        />
      </div>
    );
  }
  if (!staff) {
    return (
      <div className="fade-in">
        <SectionTitle title="Consultation" />
        <EmptyState
          title="Sign in required"
          detail="Your staff record could not be matched, so notes cannot be signed. Contact the practice manager."
        />
      </div>
    );
  }

  function patch(partial: Partial<Consultation>) {
    setNote((current) => ({ ...current, ...partial }));
  }

  function appendTranscript(text: string) {
    setNote((current) => ({ ...current, aiTranscript: current.aiTranscript ? `${current.aiTranscript} ${text}` : text }));
  }

  function stopSegmentTimer() {
    if (segmentTimerRef.current !== null) {
      window.clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }

  function startSegment(stream: MediaStream, patientId: string) {
    const rec = new MediaRecorder(stream);
    const mimeType = rec.mimeType || 'audio/webm';
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size > 0) {
        const index = segmentIndexRef.current;
        segmentIndexRef.current += 1;
        const name = audioFilename(mimeType).replace('consult', `consult-${index}`);
        setPendingSegments((count) => count + 1);
        // Sequential queue keeps segment text in speaking order even when
        // responses complete out of order.
        uploadQueueRef.current = uploadQueueRef.current.then(async () => {
          try {
            const result = await transcribeSegment({ patientId, audio: blob, audioName: name });
            if (result.ok && result.text.trim()) appendTranscript(result.text.trim());
            else if (!result.ok) setScribeError((prev) => prev || `Part ${index + 1} transcription failed: ${result.error}`);
          } finally {
            setPendingSegments((count) => count - 1);
          }
        });
      }
      if (recordingActiveRef.current) startSegment(stream, patientId);
      else streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    rec.start();
    recorderRef.current = rec;
  }

  return (
    <div className="fade-in grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <SectionTitle title={`Consultation · ${patient.firstName} ${patient.lastName}`} description="SOAP note. AI drafts require your approval before they are written into the record." />
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Note type</p>
          <div className="flex flex-wrap gap-2">
            {CONSULTATION_TEMPLATES.map((item) => (
              <button key={item.id} type="button" onClick={() => patch({ templateType: item.id })} className={`rounded-md px-3 py-1.5 text-[11px] ${note.templateType === item.id ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] italic text-slate-500">
            Pick the kind of consultation — it adjusts the example prompts in the SOAP fields below. {CONSULTATION_TEMPLATES.find((item) => item.id === note.templateType)?.hint}
          </p>
        </div>
        <div className="surface space-y-3 rounded-xl p-4">
          {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
            <Field key={field} label={field.toUpperCase()}>
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={note[field]}
                placeholder={CONSULTATION_TEMPLATES.find((item) => item.id === note.templateType)?.placeholders[field]}
                onChange={(e) => patch({ [field]: e.target.value })}
              />
            </Field>
          ))}
          <div className="text-[11px] text-slate-500">ICPC-2: {note.icpc2Codes.join(', ') || '—'}</div>
          <div className="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              onClick={() => {
                appStore.saveConsultation(note);
                setLocation(`/patients/${patient.id}`);
              }}
            >
              Save draft
            </AppButton>
            <AppButton
              size="sm"
              variant="primary"
              testId="button-sign-note"
              onClick={() => {
                if (!window.confirm('Sign this consultation note? A signed note is added to the patient record and can no longer be edited.')) return;
                const signed = { ...note, status: 'signed' as const, signedAt: nowIso(), staffId: staff.id };
                appStore.saveConsultation(signed);
                setLocation(`/patients/${patient.id}`);
              }}
            >
              Sign note
            </AppButton>
          </div>
        </div>

        <PrescribePanel
          patientId={patient.id}
          staffId={staff.id}
          staffRole={staff.role}
          consultationId={note.id}
          pharmacyHealthmail={patient.pharmacyHealthmail}
        />
        <ReferPanel
          patientId={patient.id}
          staffId={staff.id}
          consultationId={note.id}
        />
      </div>
      <aside className="surface rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-800">Síle scribe</h2>
        {budgetReached && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
            <p className="font-semibold">Monthly AI budget reached</p>
            <p className="mt-1">Síle is paused until next month. You can still record and transcribe for free on this device (button below), or type the note directly in the SOAP fields on the left —
            everything saves the same way. The practice manager can raise the cap.</p>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={ui.consent} onChange={(e) => consultationStore.setConsent(e.target.checked)} />
          Patient consent for recording
        </label>
        <AppButton
          size="sm"
          disabled={budgetReached || !ui.consent || structuring}
          onClick={async () => {
            setScribeError('');
            if (!ui.recording) {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                streamRef.current = stream;
                recordingActiveRef.current = true;
                setRecordingSeconds(0);
                if (budgetReached) {
                  // Offline mode: one continuous recording, transcribed
                  // on-device when the GP stops — no API, no cost.
                  offlineChunksRef.current = [];
                  const rec = new MediaRecorder(stream);
                  rec.ondataavailable = (event) => {
                    if (event.data.size > 0) offlineChunksRef.current.push(event.data);
                  };
                  rec.onstop = () => {
                    setOfflineBlob(new Blob(offlineChunksRef.current, { type: rec.mimeType || 'audio/webm' }));
                    streamRef.current?.getTracks().forEach((track) => track.stop());
                  };
                  rec.start();
                  recorderRef.current = rec;
                  segmentTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
                } else {
                  // Paid mode — segments roll every 30s and are transcribed
                  // live.
                  segmentIndexRef.current = 0;
                  uploadQueueRef.current = Promise.resolve();
                  startSegment(stream, patient.id);
                  segmentTimerRef.current = window.setInterval(() => {
                    setRecordingSeconds((seconds) => seconds + SEGMENT_MS / 1000);
                    if (recorderRef.current?.state === 'recording') recorderRef.current?.stop();
                  }, SEGMENT_MS);
                }
                consultationStore.setRecording(true);
              } catch {
                setScribeError('Microphone access denied. Type the transcript below instead.');
              }
              return;
            }
            // Stop capture — in paid mode the final partial segment is
            // transcribed too; offline mode yields the recording blob.
            recordingActiveRef.current = false;
            stopSegmentTimer();
            recorderRef.current?.stop();
            recorderRef.current = null;
            consultationStore.setRecording(false);
          }}
        >
          {ui.recording ? 'Stop capture' : 'Start capture'}
        </AppButton>
        {ui.recording && (
          <p className="text-[11px] text-teal-700">● Recording — {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}.{budgetReached ? ' Audio is kept on this device until transcribed.' : ' Transcript fills in below as Síle hears each part.'}</p>
        )}
        {!ui.recording && pendingSegments > 0 && (
          <p className="text-[11px] text-slate-500">Finishing transcription of the last part…</p>
        )}
        <textarea className={`${inputClass} mt-3 h-40 py-2`} value={note.aiTranscript} onChange={(e) => patch({ aiTranscript: e.target.value })} placeholder="Live transcript — fills in while recording, or type notes to structure" />
        {budgetReached ? (
          <>
            <AppButton
              size="sm"
              variant="primary"
              disabled={!offlineBlob || localTranscribing || ui.recording}
              onClick={async () => {
                if (!offlineBlob) return;
                setScribeError('');
                setLocalTranscribing(true);
                setLocalStatus('Loading speech model…');
                try {
                  const text = await transcribeLocal(offlineBlob, setLocalStatus);
                  const draft = draftSoapFromTranscript(text, '');
                  patch({
                    aiTranscript: text,
                    aiDraftNote: draft,
                    aiSummary: draftSummaryFromTranscript(text),
                    icpc2Codes: suggestIcpc2(text),
                    aiScribeUsed: true,
                  });
                  setLocalStatus('');
                } catch {
                  setScribeError('On-device transcription failed — type the transcript below instead.');
                } finally {
                  setLocalTranscribing(false);
                }
              }}
            >
              {localTranscribing ? 'Transcribing on device…' : 'Transcribe on device (free)'}
            </AppButton>
            {localStatus && <p className="text-[11px] text-slate-500">{localStatus}</p>}
            {offlineBlob && !ui.recording && !localTranscribing && (
              <p className="text-[11px] text-slate-500">Recording captured. On-device Whisper runs in this browser — audio never leaves the computer. Quality is lower than Síle's cloud transcription; review the draft carefully.</p>
            )}
          </>
        ) : (
          <AppButton
          size="sm"
          variant="primary"
          disabled={structuring || ui.recording || pendingSegments > 0 || !note.aiTranscript.trim()}
          onClick={async () => {
            setScribeError('');
            setStructuring(true);
            // Note: nothing is persisted yet — the AI draft stays local until
            // the GP explicitly saves or signs the note.
            const remote = await structureSoapRemote({
              patientId: patient.id,
              // The live segments are already transcribed — structure the text
              // directly (no second transcription pass, no double metering).
              transcript: note.aiTranscript,
              audio: null,
            });
            setStructuring(false);
            if (remote.ok) {
              patch({
                aiTranscript: remote.result.dialogue || remote.result.transcript || note.aiTranscript,
                aiDraftNote: remote.result.draft,
                aiSummary: remote.result.summary || note.aiSummary,
                icpc2Codes: remote.result.codes.length ? remote.result.codes : suggestIcpc2(remote.result.transcript || note.aiTranscript),
                aiScribeUsed: true,
              });
            } else if (/budget/i.test(remote.error)) {
              setBudgetReached(true);
              setScribeError('');
            } else {
              // Fallback to the local heuristic draft so the GP is never blocked.
              setScribeError(`${remote.error} Using local draft instead.`);
              const result = appStore.generateAiSoap(note.id, note.aiTranscript, patient.id);
              const draft = result.draft ?? draftSoapFromTranscript(note.aiTranscript, '');
              patch({ aiDraftNote: draft, aiSummary: draftSummaryFromTranscript(note.aiTranscript), icpc2Codes: result.codes ?? suggestIcpc2(note.aiTranscript), aiScribeUsed: true });
            }
          }}
        >
          {structuring ? 'Structuring…' : 'Structure SOAP'}
          </AppButton>
        )}
        {scribeError && <p className="text-[11px] text-amber-700">{scribeError}</p>}
        {note.aiSummary && (
          <div className="mt-3 rounded-lg bg-[#eef4f9] p-3 text-[11px] leading-5 text-slate-600">
            <p className="font-semibold text-slate-800">Síle summary</p>
            <p className="mt-1">{note.aiSummary}</p>
            <p className="mt-1 text-[10px] text-slate-400">Drafted by AI from the transcript — included in the note when signed. Edit anything in the SOAP fields; regenerate by structuring again.</p>
          </div>
        )}
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

// ─── Prescribe panel (GP only) ───────────────────────────────────────────────

const CONTROLLED_DRUGS = ['morphine', 'oxycodone', 'fentanyl', 'codeine', 'diazepam', 'alprazolam', 'zolpidem', 'methylphenidate', 'pregabalin'];

function PrescribePanel({
  patientId,
  staffId,
  staffRole,
  consultationId,
  pharmacyHealthmail,
}: {
  patientId: string;
  staffId: string;
  staffRole: string;
  consultationId: string;
  pharmacyHealthmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [drugName, setDrugName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [durationMonths, setDurationMonths] = useState(3);
  const [pharmacy, setPharmacy] = useState(pharmacyHealthmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!canApprovePrescriptions(staffRole as any)) return null;

  const controlled = CONTROLLED_DRUGS.some((d) => drugName.toLowerCase().includes(d));

  const save = async () => {
    if (!drugName.trim()) { setError('Drug name is required'); return; }
    if (!dose.trim()) { setError('Dose is required'); return; }
    if (!frequency.trim()) { setError('Frequency is required'); return; }
    setError('');
    setSaving(true);

    const rx = appStore.addPrescription({
      patientId,
      staffId,
      consultationId,
      drugName: drugName.trim(),
      dose: dose.trim(),
      frequency: frequency.trim(),
      durationMonths,
      pharmacyHealthmail: pharmacy,
      status: 'active',
      refillsRemaining: 0,
      controlled,
    });

    if (supabaseConfigured) {
      const result = await insertPrescription({ ...rx });
      if (result.error) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSuccess(`${drugName} prescribed`);
    setDrugName('');
    setDose('');
    setFrequency('');
    setDurationMonths(3);
    setTimeout(() => setSuccess(''), 3000);
  };

  if (!open) {
    return (
      <div className="mt-4">
        <AppButton size="sm" onClick={() => setOpen(true)}>
          + Prescribe medication
        </AppButton>
        {success && <span className="ml-2 text-[11px] text-teal-700">✓ {success}</span>}
      </div>
    );
  }

  return (
    <div className="surface mt-4 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">New prescription</h3>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>Close</button>
      </div>
      {controlled && (
        <p className="mb-2 rounded-md bg-coral-50 px-3 py-2 text-[11px] text-red-700 bg-red-50">
          ⚠ Controlled substance detected — second check required per practice protocol.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Drug name">
          <input className={inputClass} value={drugName} onChange={(e) => setDrugName(e.target.value)} placeholder="e.g. Metformin" />
        </Field>
        <Field label="Dose">
          <input className={inputClass} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 500mg" />
        </Field>
        <Field label="Frequency">
          <input className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. Twice daily (BD)" />
        </Field>
        <Field label="Duration (months)">
          <input className={inputClass} type="number" min={1} max={12} value={durationMonths} onChange={(e) => setDurationMonths(Number(e.target.value))} />
        </Field>
        <Field label="Pharmacy Healthmail">
          <input className={inputClass} value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="pharmacy@healthmail.ie" />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-2 text-xs text-teal-700">✓ {success}</p>}
      <div className="mt-3 flex gap-2">
        <AppButton size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Prescribe'}
        </AppButton>
        <AppButton size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
      </div>
    </div>
  );
}

// ─── Refer panel ─────────────────────────────────────────────────────────────

const IRISH_HOSPITALS = [
  "St James's Hospital",
  'Mater Misericordiae',
  "St Vincent's University Hospital",
  'Beaumont Hospital',
  'Tallaght University Hospital',
  'Connolly Hospital',
  'Rotunda Hospital',
  'Coombe Hospital',
  'National Maternity Hospital',
  'Community / Primary Care',
  'Other',
];

const SPECIALTIES = [
  'Cardiology',
  'Dermatology',
  'Dietetics',
  'ENT',
  'Endocrinology',
  'Gastroenterology',
  'General Surgery',
  'Geriatrics',
  'Gynaecology',
  'Haematology',
  'Nephrology',
  'Neurology',
  'Obstetrics',
  'Oncology',
  'Ophthalmology',
  'Orthopaedics',
  'Pain Management',
  'Palliative Care',
  'Physiotherapy',
  'Psychiatry',
  'Radiology',
  'Respiratory',
  'Rheumatology',
  'Urology',
  'Other',
];

function ReferPanel({
  patientId,
  staffId,
  consultationId,
}: {
  patientId: string;
  staffId: string;
  consultationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [specialty, setSpecialty] = useState('');
  const [hospital, setHospital] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async () => {
    if (!specialty) { setError('Specialty is required'); return; }
    if (!hospital) { setError('Hospital is required'); return; }
    if (!notes.trim()) { setError('Clinical notes / reason for referral is required'); return; }
    setError('');
    setSaving(true);

    const ref = appStore.addReferral({
      patientId,
      staffId,
      consultationId,
      specialty,
      hospital,
      notes: notes.trim(),
      status: 'draft',
      sileDrafted: false,
    });

    if (supabaseConfigured) {
      const result = await insertReferral({ ...ref });
      if (result.error) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSuccess(`${specialty} referral drafted → Referrals page for approval`);
    setSpecialty('');
    setHospital('');
    setNotes('');
    setTimeout(() => setSuccess(''), 4000);
  };

  if (!open) {
    return (
      <div className="mt-3">
        <AppButton size="sm" onClick={() => setOpen(true)}>
          + Draft referral
        </AppButton>
        {success && <span className="ml-2 text-[11px] text-teal-700">✓ {success}</span>}
      </div>
    );
  }

  return (
    <div className="surface mt-3 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">New referral</h3>
        <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Specialty">
          <select className={inputClass} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="">Select…</option>
            {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Hospital">
          <select className={inputClass} value={hospital} onChange={(e) => setHospital(e.target.value)}>
            <option value="">Select…</option>
            {IRISH_HOSPITALS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Clinical notes / reason for referral">
        <textarea className={`${inputClass} mt-1 h-24 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical history, findings, reason for referral…" />
      </Field>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-2 text-xs text-teal-700">✓ {success}</p>}
      <div className="mt-3 flex gap-2">
        <AppButton size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save as draft'}
        </AppButton>
        <AppButton size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Drafts appear on the Referrals page → GP clicks "Approve & send" to submit via HealthLink.
      </p>
    </div>
  );
}
