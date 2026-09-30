import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, HeartPulse, Users, X } from 'lucide-react';
import { AppButton, Avatar, Badge, MetricCard, SectionTitle, TableShell, Tabs } from '@/components/shared/ui';
import {
  enrolCdmPatient,
  fetchCdmEnrolments,
  fetchCdmReviews,
  signCdmGpReview,
  signCdmNurseReview,
  startCdmReview,
  withdrawCdmEnrolment,
} from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { formatEur, formatIrishDate } from '@/lib/utils';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName, type CdmCondition, type CdmReview } from '@/types/domain';

const CONDITION_LABEL: Record<CdmCondition, string> = {
  dm2: 'Type 2 Diabetes',
  copd: 'COPD',
  asthma: 'Asthma',
  hf: 'Heart Failure',
  ihd: 'IHD',
  stroke_tia: 'Stroke / TIA',
  af: 'Atrial Fibrillation',
  htn: 'Hypertension',
};

// Structured review fields per condition (PCRS CDM cycle requirements).
const REVIEW_FIELDS: Record<CdmCondition, Array<{ key: string; label: string; unit?: string }>> = {
  dm2: [
    { key: 'hba1c', label: 'HbA1c', unit: 'mmol/mol' },
    { key: 'fasting_glucose', label: 'Fasting glucose', unit: 'mmol/L' },
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'bmi', label: 'BMI', unit: 'kg/m²' },
    { key: 'foot_exam', label: 'Foot exam done (date/normal)' },
    { key: 'retinal_screening', label: 'Retinal screening status' },
    { key: 'lifestyle', label: 'Lifestyle assessment' },
    { key: 'self_mgmt_goals', label: 'Self-management goals' },
  ],
  copd: [
    { key: 'fev1', label: 'Spirometry FEV1 % predicted', unit: '%' },
    { key: 'mrc', label: 'MRC dyspnoea score (1-5)' },
    { key: 'inhaler_technique', label: 'Inhaler technique' },
    { key: 'exacerbations', label: 'Exacerbations (past 12 mo)' },
    { key: 'smoking', label: 'Smoking status' },
  ],
  asthma: [
    { key: 'act_score', label: 'ACT score (5-25)' },
    { key: 'peak_flow', label: 'Peak flow', unit: 'L/min' },
    { key: 'triggers', label: 'Triggers identified' },
    { key: 'preventer_compliance', label: 'Preventer compliance' },
    { key: 'action_plan', label: 'Action plan in place' },
  ],
  hf: [
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'lipids', label: 'Lipids (LDL)', unit: 'mmol/L' },
    { key: 'anticoagulation', label: 'Anticoagulation status' },
    { key: 'nyha', label: 'NYHA class (I-IV)' },
    { key: 'exercise', label: 'Exercise capacity' },
  ],
  ihd: [
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'lipids', label: 'Lipids (LDL)', unit: 'mmol/L' },
    { key: 'anticoagulation', label: 'Anticoagulation status' },
    { key: 'nyha', label: 'NYHA class (I-IV)' },
    { key: 'exercise', label: 'Exercise capacity' },
  ],
  stroke_tia: [
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'lipids', label: 'Lipids (LDL)', unit: 'mmol/L' },
    { key: 'anticoagulation', label: 'Anticoagulation status' },
    { key: 'nyha', label: 'NYHA class (I-IV)' },
    { key: 'exercise', label: 'Exercise capacity' },
  ],
  af: [
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'lipids', label: 'Lipids (LDL)', unit: 'mmol/L' },
    { key: 'anticoagulation', label: 'Anticoagulation status' },
    { key: 'nyha', label: 'NYHA class (I-IV)' },
    { key: 'exercise', label: 'Exercise capacity' },
  ],
  htn: [
    { key: 'bp', label: 'Blood pressure', unit: 'mmHg' },
    { key: 'lipids', label: 'Lipids (LDL)', unit: 'mmol/L' },
    { key: 'lifestyle', label: 'Lifestyle assessment' },
  ],
};

const CDM_ANNUAL_FEE_EUR = 140; // PCRS cycle fee — shown as an estimate

function ageFrom(dob: string): number {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 86400000));
}

// ---------------- review form modal ----------------

function ReviewFormModal({
  review,
  condition,
  staffId,
  practiceId,
  onClose,
}: {
  review: CdmReview;
  condition: CdmCondition;
  staffId: string;
  practiceId: string;
  onClose: () => void;
}) {
  const isGpStage = review.nurseSigned && !review.gpSigned;
  const fields = REVIEW_FIELDS[condition] ?? REVIEW_FIELDS.dm2;
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const initial: Record<string, string | number> = {};
    fields.forEach((f) => {
      initial[f.key] = review.reviewData[f.key] !== undefined ? String(review.reviewData[f.key]) : '';
    });
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    const result = isGpStage
      ? await signCdmGpReview({
          reviewId: review.id,
          practiceId,
          patientId: review.patientId,
          staffId,
          reviewData: values,
          stcCode: 'CDM',
        })
      : await signCdmNurseReview({ reviewId: review.id, staffId, reviewData: values });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Save failed');
      return;
    }
    if (result.review) appStore.upsertCdmReviews([result.review]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {isGpStage ? 'GP review & sign-off' : 'Nurse review'}
          </h3>
          <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-2">
        {fields.map((field) => (
          <label key={field.key} className="grid grid-cols-[1fr_150px] items-center gap-2 text-xs">
            <span className="text-slate-600">
              {field.label}
              {field.unit ? <span className="text-slate-400"> ({field.unit})</span> : ''}
            </span>
            <input
              className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
              value={String(values[field.key] ?? '')}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          </label>
        ))}
        {isGpStage && (
          <p className="mt-1 rounded-md bg-teal-50 px-3 py-2 text-[11px] text-teal-800">
            Signing off completes the cycle and stages a PCRS claim (STC: CDM).
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <AppButton size="sm" onClick={onClose}>Cancel</AppButton>
          <AppButton size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : isGpStage ? 'GP sign-off' : 'Nurse sign'}
          </AppButton>
        </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- page ----------------

export default function CdmPage() {
  const state = useAppState();
  const staff = useSessionStaff();
  const [tab, setTab] = useState('Reviews due');
  const [loaded, setLoaded] = useState(false);
  const [activeReview, setActiveReview] = useState<CdmReview | null>(null);
  const [activeCondition, setActiveCondition] = useState<CdmCondition>('dm2');
  const [enrolError, setEnrolError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured || loaded) return;
    setLoaded(true);
    void fetchCdmEnrolments().then((rows) => rows.length && appStore.upsertCdmEnrolments(rows));
    void fetchCdmReviews().then((rows) => rows.length && appStore.upsertCdmReviews(rows));
  }, [loaded]);

  const enrolments = state.cdmEnrolments;
  const activeEnrolments = enrolments.filter((e) => e.status === 'active');
  const enrolledPatientIds = new Set(activeEnrolments.map((e) => e.patientId));

  // Eligibility: GMS / GP visit card, 18+, has a CDM condition, not enrolled.
  const eligible = state.patients.filter((patient) => {
    if (patient.medicalCardType === 'none') return false;
    if (ageFrom(patient.dob) < 18) return false;
    if (enrolledPatientIds.has(patient.id)) return false;
    return (patient.chronicConditions ?? []).some((c) => c in CONDITION_LABEL);
  });

  const reviews = state.cdmReviews;
  const dueThisMonth = activeEnrolments.filter((e) => {
    if (!e.nextReviewDate) return false;
    const reviewMonth = e.nextReviewDate.slice(0, 7);
    return reviewMonth === new Date().toISOString().slice(0, 7);
  });
  const claimReady = reviews.filter((r) => r.nurseSigned && r.gpSigned).length;
  const revenueEstimate = activeEnrolments.length * CDM_ANNUAL_FEE_EUR;

  const enrol = async (patientId: string, condition: CdmCondition) => {
    setEnrolError('');
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    const result = await enrolCdmPatient({
      practiceId: state.practice.id,
      patientId,
      condition,
      nextReviewDate: next.toISOString().slice(0, 10),
    });
    if (!result.ok) {
      setEnrolError(result.error ?? 'Enrolment failed');
      return;
    }
    if (result.enrolment) appStore.upsertCdmEnrolments([result.enrolment]);
  };

  const startReview = async (enrolmentId: string, patientId: string, condition: CdmCondition) => {
    if (!staff) return;
    setEnrolError('');
    const result = await startCdmReview({
      practiceId: state.practice.id,
      enrolmentId,
      patientId,
      staffId: staff.id,
      reviewType: 'nurse',
    });
    if (!result.ok || !result.review) {
      setEnrolError(result.error ?? 'Could not start review');
      return;
    }
    appStore.upsertCdmReviews([result.review]);
    setActiveReview(result.review);
    setActiveCondition(condition);
  };

  const canNurseSign = staff && ['nurse', 'gp', 'hca'].includes(staff.role);
  const canGpSign = staff?.role === 'gp';

  return (
    <div className="fade-in">
      <SectionTitle
        title="CDM programme"
        description={`Nurse measurements then GP sign-off. PCRS claim staged on GP sign-off. Est. programme value ${formatEur(revenueEstimate)}/yr.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Enrolled" value={String(activeEnrolments.length)} detail="Active" icon={HeartPulse} tone="purple" />
        <MetricCard label="Due this month" value={String(dueThisMonth.length)} detail="Recalls via Workflows" icon={Users} tone="amber" />
        <MetricCard label="Reviews open" value={String(reviews.filter((r) => !r.completedAt).length)} detail="Need dual sign-off" icon={Clock3} tone="amber" />
        <MetricCard label="Completed cycles" value={String(claimReady)} detail="PCRS claim staged" icon={CheckCircle2} tone="teal" />
      </div>
      <div className="mt-5">
        <Tabs items={['Reviews due', 'Eligible', 'Enrolments']} value={tab} onChange={setTab} />
      </div>
      {enrolError && <p className="mt-2 text-xs text-red-600">{enrolError}</p>}

      {tab === 'Reviews due' && (
        <TableShell>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Condition</th>
              <th>Nurse</th>
              <th>GP</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 && (
              <tr><td colSpan={5} className="text-center text-xs text-slate-400">No reviews yet — start one from the Enrolments tab.</td></tr>
            )}
            {reviews.map((row) => {
              const patient = state.patients.find((p) => p.id === row.patientId);
              const enrolment = enrolments.find((e) => e.id === row.enrolmentId);
              const condition = (enrolment?.condition ?? 'dm2') as CdmCondition;
              return (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {patient && <Avatar name={patientName(patient)} size="sm" tone="purple" />}
                      {patient ? patientName(patient) : row.patientId}
                    </div>
                  </td>
                  <td><Badge tone="purple">{CONDITION_LABEL[condition]}</Badge></td>
                  <td>{row.nurseSigned ? <Badge tone="teal">Signed</Badge> : <Badge tone="amber">Open</Badge>}</td>
                  <td>{row.gpSigned ? <Badge tone="teal">Signed</Badge> : row.nurseSigned ? <Badge tone="amber">Awaiting GP</Badge> : <span className="text-[10px] text-slate-400">Waiting on nurse</span>}</td>
                  <td>
                    {row.completedAt ? (
                      <span className="text-[10px] text-slate-400">Completed {formatIrishDate(row.completedAt)}{row.pcrsClaimId ? ' · claim staged' : ''}</span>
                    ) : row.nurseSigned && canGpSign && (
                      <AppButton
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setActiveReview(row);
                          setActiveCondition(condition);
                        }}
                      >
                        GP sign-off
                      </AppButton>
                    )}
                    {!row.nurseSigned && canNurseSign && (
                      <AppButton
                        size="sm"
                        onClick={() => {
                          setActiveReview(row);
                          setActiveCondition(condition);
                        }}
                      >
                        Nurse review
                      </AppButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {tab === 'Eligible' && (
        <div className="surface divide-y rounded-xl">
          <p className="px-4 py-3 text-[11px] text-slate-500">
            GMS / GP visit card patients aged 18+ with a qualifying chronic condition and not yet
            enrolled. Eligibility is driven by conditions recorded on the patient record.
          </p>
          {eligible.length === 0 && (
            <div className="px-4 py-4 text-xs text-slate-400">No eligible patients found.</div>
          )}
          {eligible.map((patient) => {
            const conditions = (patient.chronicConditions ?? []).filter((c) => c in CONDITION_LABEL) as CdmCondition[];
            return (
              <div key={patient.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs">
                <div className="flex flex-1 items-center gap-2">
                  <Avatar name={patientName(patient)} size="sm" tone="purple" />
                  <span>
                    {patientName(patient)} <span className="text-slate-400">· {ageFrom(patient.dob)} yrs · {patient.medicalCardType === 'gms' ? 'GMS' : 'GP visit card'}</span>
                  </span>
                </div>
                {conditions.map((condition) => (
                  <Badge key={condition} tone="purple">{CONDITION_LABEL[condition]}</Badge>
                ))}
                <select
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  value={conditions[0] ?? 'dm2'}
                  onChange={() => undefined}
                  id={`cond-${patient.id}`}
                >
                  {conditions.map((condition) => (
                    <option key={condition} value={condition}>{CONDITION_LABEL[condition]}</option>
                  ))}
                </select>
                <AppButton
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const select = document.getElementById(`cond-${patient.id}`) as HTMLSelectElement;
                    void enrol(patient.id, (select?.value ?? conditions[0]) as CdmCondition);
                  }}
                >
                  Enrol
                </AppButton>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Enrolments' && (
        <div className="surface divide-y rounded-xl">
          {activeEnrolments.length === 0 && (
            <div className="px-4 py-4 text-xs text-slate-400">No active enrolments.</div>
          )}
          {activeEnrolments.map((item) => {
            const patient = state.patients.find((p) => p.id === item.patientId);
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
                <span className="flex-1">
                  {patient ? patientName(patient) : item.patientId}
                  <span className="text-slate-400"> · enrolled {formatIrishDate(item.enrolledDate)} · next review {item.nextReviewDate ? formatIrishDate(item.nextReviewDate) : '—'}</span>
                </span>
                <Badge tone="purple">{CONDITION_LABEL[item.condition]}</Badge>
                {!item.consentSigned && <Badge tone="amber">Consent needed</Badge>}
                {staff && (
                  <AppButton size="sm" onClick={() => void startReview(item.id, item.patientId, item.condition)}>
                    Start review
                  </AppButton>
                )}
                <AppButton
                  size="sm"
                  onClick={() => {
                    void withdrawCdmEnrolment(item.id).then((result) => {
                      if (result.ok) appStore.upsertCdmEnrolments([{ ...item, status: 'withdrawn' }]);
                      else setEnrolError(result.error ?? 'Withdraw failed');
                    });
                  }}
                >
                  Withdraw
                </AppButton>
              </div>
            );
          })}
        </div>
      )}

      {activeReview && (
        <ReviewFormModal
          review={activeReview}
          condition={activeCondition}
          staffId={staff?.id ?? ''}
          practiceId={state.practice.id}
          onClose={() => setActiveReview(null)}
        />
      )}
    </div>
  );
}
