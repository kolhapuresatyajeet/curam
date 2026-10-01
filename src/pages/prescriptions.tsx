import { useState } from 'react';
import { Clock3, Send, ShieldCheck } from 'lucide-react';
import { AppButton, Avatar, Badge, EmptyState, MetricCard, SectionTitle, TableShell } from '@/components/shared/ui';
import { canApprovePrescriptions } from '@/lib/permissions';
import { sendViaHealthmail } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { formatIrishDate } from '@/lib/utils';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function PrescriptionsPage() {
  const state = useAppState();
  const staff = useSessionStaff();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<{ id: string; message: string } | null>(null);

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
                      <AppButton
                        size="sm"
                        variant="primary"
                        testId={`button-approve-rx-${row.id}`}
                        onClick={() => {
                          if (!window.confirm(`Approve ${row.medicine} for ${patient ? patientName(patient) : 'this patient'}? A GP sign-off is recorded.`)) return;
                          appStore.approveRepeat(row.id, staff.id);
                        }}
                      >
                        Approve
                      </AppButton>
                    )}
                    {row.status === 'approved' && (
                      <span className="flex flex-col items-start gap-1">
                        <AppButton
                          size="sm"
                          disabled={sendingId === row.id}
                          onClick={async () => {
                            if (!window.confirm('Send this prescription to the patient via Healthmail? This cannot be undone.')) return;
                            setSendError(null);
                            setSendingId(row.id);
                            if (supabaseConfigured) {
                              const result = await sendViaHealthmail({ repeatRequestId: row.id });
                              if (!result.ok) {
                                setSendError({ id: row.id, message: String(result.payload.error ?? 'Send failed') });
                                setSendingId(null);
                                return;
                              }
                            }
                            appStore.sendRepeatHealthmail(row.id);
                            setSendingId(null);
                          }}
                        >
                          {sendingId === row.id ? 'Sending…' : 'Send Healthmail'}
                        </AppButton>
                        {sendError?.id === row.id && <span className="text-[10px] text-red-600">{sendError.message}</span>}
                      </span>
                    )}
                    {row.status === 'pending' && staff && !canApprovePrescriptions(staff.role) && <span className="text-[10px] text-slate-400">GP only</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
        {state.repeatRequests.length === 0 && (
          <EmptyState title="No repeat requests" detail="Patient requests arrive here for GP approval — nothing is ever auto-approved." />
        )}
      </div>
    </div>
  );
}
