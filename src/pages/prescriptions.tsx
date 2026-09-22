import { Clock3, Send, ShieldCheck } from 'lucide-react';
import { AppButton, Avatar, Badge, MetricCard, SectionTitle, TableShell } from '@/components/shared/ui';
import { canApprovePrescriptions } from '@/lib/permissions';
import { formatIrishDate } from '@/lib/utils';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function PrescriptionsPage() {
  const state = useAppState();
  const staff = useSessionStaff();

  return (
    <div className="fade-in">
      <SectionTitle title="Prescriptions" description="GP approval is required. Healthmail send happens only after sign-off." />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pending review" value={String(state.repeatRequests.filter((r) => r.status === 'pending').length)} detail="Never auto-approved" icon={Clock3} tone="amber" />
        <MetricCard label="Sent" value={String(state.repeatRequests.filter((r) => r.status === 'sent').length)} detail="Via Healthmail" icon={Send} tone="teal" />
        <MetricCard label="Controlled" value={String(state.prescriptions.filter((r) => r.controlled).length)} detail="Second check" icon={ShieldCheck} tone="coral" />
      </div>
      <div className="mt-4">
        <TableShell>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Medication</th>
              <th>Via</th>
              <th>Date</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.repeatRequests.map((row) => {
              const patient = state.patients.find((p) => p.id === row.patientId);
              return (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {patient && <Avatar name={patientName(patient)} size="sm" tone="blue" />}
                      <span className="font-semibold text-slate-700">{patient ? patientName(patient) : '—'}</span>
                    </div>
                  </td>
                  <td>{row.medicine}</td>
                  <td>{row.requestedVia}</td>
                  <td>{formatIrishDate(row.requestedAt)}</td>
                  <td>
                    <Badge tone={row.status === 'pending' ? 'amber' : 'teal'}>{row.status}</Badge>
                  </td>
                  <td>
                    {row.status === 'pending' && staff && canApprovePrescriptions(staff.role) && (
                      <AppButton size="sm" variant="primary" onClick={() => appStore.approveRepeat(row.id, staff.id)}>
                        Approve
                      </AppButton>
                    )}
                    {row.status === 'approved' && (
                      <AppButton size="sm" onClick={() => appStore.sendRepeatHealthmail(row.id)}>
                        Send Healthmail
                      </AppButton>
                    )}
                    {row.status === 'pending' && staff && !canApprovePrescriptions(staff.role) && <span className="text-[10px] text-slate-400">GP only</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </div>
    </div>
  );
}
