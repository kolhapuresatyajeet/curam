import { CheckCircle2, CircleDollarSign, Clock3, Users } from 'lucide-react';
import { AppButton, Avatar, Badge, MetricCard, SectionTitle, TableShell, Tabs } from '@/components/shared/ui';
import { formatIrishDate } from '@/lib/utils';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName } from '@/types/domain';
import { useState } from 'react';

export default function CdmPage() {
  const state = useAppState();
  const staff = useSessionStaff();
  const [tab, setTab] = useState('Reviews due');
  const enrolled = state.cdmEnrolments.filter((e) => e.status === 'active');

  return (
    <div className="fade-in">
      <SectionTitle title="CDM programme" description="Nurse measurements then GP sign-off. PCRS claim only after both stages." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Enrolled" value={String(enrolled.length)} detail="Active" icon={Users} tone="purple" />
        <MetricCard label="Reviews open" value={String(state.cdmReviews.filter((r) => !r.completedAt).length)} detail="Need dual sign-off" icon={Clock3} tone="amber" />
        <MetricCard label="Completed" value={String(state.cdmReviews.filter((r) => r.completedAt).length)} detail="This workspace" icon={CheckCircle2} tone="teal" />
        <MetricCard label="Claim-ready" value={String(state.cdmReviews.filter((r) => r.nurseSigned && r.gpSigned).length)} detail="STC generated on complete" icon={CircleDollarSign} tone="teal" />
      </div>
      <div className="mt-5">
        <Tabs items={['Reviews due', 'Enrolments', 'Forms']} value={tab} onChange={setTab} />
      </div>
      {tab === 'Reviews due' && (
        <TableShell>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Type</th>
              <th>Nurse</th>
              <th>GP</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.cdmReviews.map((row) => {
              const patient = state.patients.find((p) => p.id === row.patientId);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {patient && <Avatar name={patientName(patient)} size="sm" tone="purple" />}
                      {patient ? patientName(patient) : row.patientId}
                    </div>
                  </td>
                  <td>{row.reviewType}</td>
                  <td>{row.nurseSigned ? 'Signed' : 'Open'}</td>
                  <td>{row.gpSigned ? 'Signed' : 'Open'}</td>
                  <td>
                    {staff?.role === 'nurse' && !row.nurseSigned && (
                      <AppButton size="sm" onClick={() => appStore.signCdmReview(row.id, 'nurse')}>
                        Nurse sign
                      </AppButton>
                    )}
                    {staff?.role === 'gp' && row.nurseSigned && !row.gpSigned && (
                      <AppButton size="sm" variant="primary" onClick={() => appStore.signCdmReview(row.id, 'gp')}>
                        GP sign-off
                      </AppButton>
                    )}
                    {staff?.role === 'gp' && !row.nurseSigned && <span className="text-[10px] text-slate-400">Waiting on nurse</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
      {tab === 'Enrolments' && (
        <div className="surface divide-y rounded-xl">
          {enrolled.map((item) => {
            const patient = state.patients.find((p) => p.id === item.patientId);
            return (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 text-xs">
                <span>{patient ? patientName(patient) : item.patientId}</span>
                <Badge tone="purple">{item.condition.toUpperCase()}</Badge>
                <span className="text-slate-400">{formatIrishDate(item.enrolledDate)}</span>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'Forms' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            'Diabetes T2: HbA1c, fasting glucose, BP, BMI, foot exam, retinal screening',
            'COPD: spirometry, MRC dyspnoea, inhaler technique, exacerbations',
            'Asthma: ACT score, peak flow, triggers, preventer, action plan',
            'CVD: BP, lipids, anticoagulation, NYHA, exercise capacity',
          ].map((item) => (
            <div key={item} className="surface rounded-xl p-4 text-xs text-slate-600">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
