import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { AppButton, Avatar, Badge, EmptyState, Field, Tabs, inputClass } from '@/components/shared/ui';
import { ageFromDob, formatIrishDate, formatIrishPhone, id, nowIso } from '@/lib/utils';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName, type ConsultationTemplate } from '@/types/domain';

const TABS = ['Summary', 'Timeline', 'Consultation', 'Prescriptions', 'Results', 'Referrals', 'CDM', 'Vaccines', 'Documents'];

export default function PatientRecordPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const state = useAppState();
  const staff = useSessionStaff();
  const patient = state.patients.find((item) => item.id === params.id);
  const [tab, setTab] = useState('Summary');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  if (!patient) return <EmptyState title="Patient not found" detail="This record is not on the practice panel." />;

  const conditions = state.conditions.filter((item) => item.patientId === patient.id);
  const notes = state.consultations.filter((item) => item.patientId === patient.id);
  const rxs = state.prescriptions.filter((item) => item.patientId === patient.id);
  const labs = state.labResults.filter((item) => item.patientId === patient.id);
  const refs = state.referrals.filter((item) => item.patientId === patient.id);
  const cdms = state.cdmEnrolments.filter((item) => item.patientId === patient.id);
  const vaccines = state.vaccines.filter((item) => item.patientId === patient.id);
  const docs = state.documents.filter((item) => item.patientId === patient.id);

  return (
    <div className="fade-in">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Avatar name={patientName(patient)} size="lg" tone={patient.colour} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-semibold text-slate-800">{patientName(patient)}</h1>
          <p className="text-[11px] text-slate-500">
            DOB {formatIrishDate(patient.dob)} · {ageFromDob(patient.dob)} yrs · {formatIrishPhone(patient.phone)} · {patient.medicalCardType === 'gms' ? `GMS ${patient.gmsNumber}` : 'Private'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {conditions.map((item) => (
              <Badge key={item.id} tone="purple">
                {item.conditionName}
              </Badge>
            ))}
            {patient.allergies && patient.allergies !== 'NKDA' && <Badge tone="coral">Allergy: {patient.allergies}</Badge>}
          </div>
        </div>
        <AppButton size="sm" variant="primary" onClick={() => setLocation(`/patients/${patient.id}/consultation`)}>
          Start consultation
        </AppButton>
        <AppButton size="sm" onClick={() => setLocation('/calendar')}>
          Book
        </AppButton>
      </div>
      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === 'Summary' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Address', `${patient.address}, ${patient.eircode}`],
            ['Pharmacy', `${patient.pharmacyName} · ${patient.pharmacyHealthmail}`],
            ['IHI', patient.ihiNumber || '—'],
            ['PPS', patient.ppsNumber || '—'],
            ['Smoking', patient.smokingStatus],
            ['Síle consent', patient.sileConsent ? 'Yes' : 'No'],
          ].map(([label, value]) => (
            <div key={label} className="surface rounded-xl p-4">
              <div className="text-[10px] uppercase text-slate-400">{label}</div>
              <div className="mt-1 text-sm text-slate-700">{value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Timeline' && (
        <div className="surface divide-y rounded-xl">
          {[...notes.map((n) => ({ at: n.createdAt, title: 'Consultation', detail: n.assessment || n.subjective })), ...labs.map((l) => ({ at: l.receivedAt, title: 'Lab result', detail: l.preview }))]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((event) => (
              <div key={event.at + event.title} className="px-4 py-3">
                <div className="text-[10px] text-slate-400">{formatIrishDate(event.at)}</div>
                <div className="text-xs font-semibold text-slate-700">{event.title}</div>
                <div className="text-[11px] text-slate-500">{event.detail}</div>
              </div>
            ))}
        </div>
      )}

      {tab === 'Consultation' && (
        <div className="space-y-3">
          <AppButton
            size="sm"
            variant="primary"
            onClick={() => {
              // Nothing is saved yet — the note is only written to the record
              // when the GP explicitly saves a draft or signs it.
              setLocation(`/patients/${patient.id}/consultation?new=1`);
            }}
          >
            New SOAP note
          </AppButton>
          {notes.map((note) => {
            const expanded = expandedNoteId === note.id;
            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => setExpandedNoteId(expanded ? null : note.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedNoteId(expanded ? null : note.id); } }}
                className={`cursor-pointer rounded-xl text-left transition hover:border-teal-300 ${expanded ? 'surface border border-teal-300 p-4' : 'surface p-4'}`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {formatIrishDate(note.createdAt)} · {note.templateType} · {note.status}
                    {note.aiScribeUsed && ' · Síle scribe'}
                  </span>
                  <span className="text-teal-700">{expanded ? 'Hide ▲' : 'Details ▼'}</span>
                </div>
                {note.aiSummary && (
                  <p className="mt-2 rounded-lg bg-[#eef4f9] px-3 py-2 text-[11px] leading-5 text-slate-600">
                    <span className="font-semibold text-slate-800">Summary: </span>{note.aiSummary}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-600">{note.assessment || 'Draft'}</p>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {([['Subjective', note.subjective], ['Objective', note.objective], ['Assessment', note.assessment], ['Plan', note.plan]] as const).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="text-[12px] leading-5 text-slate-700">{value || '—'}</p>
                      </div>
                    ))}
                    {note.icpc2Codes.length > 0 && (
                      <p className="text-[11px] text-slate-500"><span className="font-semibold">ICPC-2:</span> {note.icpc2Codes.join(', ')}</p>
                    )}
                    {note.aiTranscript && (
                      <details className="text-[11px] text-slate-500">
                        <summary className="cursor-pointer">Dictation transcript</summary>
                        <p className="mt-1 whitespace-pre-wrap italic">{note.aiTranscript}</p>
                      </details>
                    )}
                    {note.signedAt && (
                      <p className="text-[10px] text-slate-400">Signed {formatIrishDate(note.signedAt)} — locked, cannot be edited.</p>
                    )}
                    {note.status === 'draft' && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <AppButton
                          size="sm"
                          variant="secondary"
                          onClick={() => setLocation(`/patients/${patient.id}/consultation?id=${note.id}`)}
                        >
                          Continue editing
                        </AppButton>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Prescriptions' && (
        <div className="surface divide-y rounded-xl">
          {rxs.map((rx) => (
            <div key={rx.id} className="px-4 py-3 text-xs">
              <span className="font-semibold text-slate-700">{rx.drugName}</span> {rx.dose} {rx.frequency}
              {rx.controlled && <Badge tone="coral">Controlled</Badge>}
            </div>
          ))}
        </div>
      )}

      {tab === 'Results' && (
        <div className="space-y-3">
          {labs.map((lab) => (
            <LabCard key={lab.id} lab={lab} />
          ))}
        </div>
      )}

      {tab === 'Referrals' && (
        <div className="surface divide-y rounded-xl">
          {refs.map((item) => (
            <div key={item.id} className="px-4 py-3 text-xs">
              {item.specialty} · {item.hospital} · {item.status}
            </div>
          ))}
        </div>
      )}

      {tab === 'CDM' && (
        <div className="surface divide-y rounded-xl">
          {cdms.map((item) => (
            <div key={item.id} className="px-4 py-3 text-xs">
              {item.condition.toUpperCase()} enrolled {formatIrishDate(item.enrolledDate)} · {item.status}
            </div>
          ))}
        </div>
      )}

      {tab === 'Vaccines' && (
        <div className="surface divide-y rounded-xl">
          {vaccines.map((item) => (
            <div key={item.id} className="px-4 py-3 text-xs">
              {item.name} · {formatIrishDate(item.givenAt)}
            </div>
          ))}
          {!vaccines.length && <div className="p-4 text-xs text-slate-400">No vaccines recorded.</div>}
        </div>
      )}

      {tab === 'Documents' && (
        <div className="surface divide-y rounded-xl">
          {docs.map((item) => (
            <div key={item.id} className="px-4 py-3 text-xs">
              {item.name} · {item.kind}
            </div>
          ))}
          {!docs.length && <div className="p-4 text-xs text-slate-400">No documents on file.</div>}
        </div>
      )}
    </div>
  );
}

function LabCard({ lab }: { lab: ReturnType<typeof useAppState>['labResults'][number] }) {
  const [comment, setComment] = useState(lab.gpComment);
  const [error, setError] = useState('');
  const abnormal = lab.abnormalFlags.length > 0;
  return (
    <div className="surface rounded-xl p-4">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold">{lab.preview}</div>
        <Badge tone={abnormal ? 'coral' : 'teal'}>{abnormal ? 'Abnormal' : 'Normal'}</Badge>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{lab.sourceHospital}</p>
      <Field label="GP comment">
        <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        <AppButton
          size="sm"
          onClick={() => {
            const result = appStore.reviewLab(lab.id, comment, 'call');
            setError(result.ok ? '' : result.error ?? '');
          }}
        >
          Mark reviewed
        </AppButton>
        <AppButton
          size="sm"
          variant="secondary"
          onClick={() => {
            const result = appStore.reviewLab(lab.id, comment, 'sile');
            setError(result.ok ? '' : result.error ?? '');
          }}
        >
          VoiceHub can deliver
        </AppButton>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
