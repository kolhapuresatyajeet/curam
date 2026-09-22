import { useState } from 'react';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { AppButton, Avatar, Badge, EmptyState, SectionTitle, TableShell, Tabs } from '@/components/shared/ui';
import { useAppState } from '@/stores/appStore';
import { useLocation } from 'wouter';
import { patientName } from '@/types/domain';

export default function HealthLinkPage() {
  const [, setLocation] = useLocation();
  const state = useAppState();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const rows = state.labResults.filter((row) => {
    const patient = state.patients.find((p) => p.id === row.patientId);
    const hay = `${patient ? patientName(patient) : ''} ${row.preview}`.toLowerCase();
    if (search && !hay.includes(search.toLowerCase())) return false;
    if (tab === 'Labs' && row.abnormalFlags) return true;
    return true;
  });

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow="Bridge agent ingest"
        title="HealthLink"
        description="Lab results, discharges and referral acks parsed from HL7 and filed to the patient record."
        action={<AppButton size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>Sync now</AppButton>}
      />
      <Tabs items={['All', 'Labs']} value={tab} onChange={setTab} />
      <input className="mb-3 h-9 max-w-sm rounded-lg border px-3 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
      <TableShell>
        <thead>
          <tr>
            <th>Type</th>
            <th>Patient</th>
            <th>Preview</th>
            <th>From</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const patient = state.patients.find((p) => p.id === row.patientId);
            const abnormal = row.abnormalFlags.length > 0;
            return (
              <tr key={row.id}>
                <td>
                  <Badge tone={abnormal ? 'coral' : 'teal'}>
                    <FlaskConical size={11} /> Lab result
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {patient && <Avatar name={patientName(patient)} size="sm" tone={patient.colour} />}
                    <span className="font-semibold text-slate-700">{patient ? patientName(patient) : 'Unmatched'}</span>
                  </div>
                </td>
                <td className="max-w-[330px] truncate">{row.preview}</td>
                <td>{row.sourceHospital}</td>
                <td>
                  <Badge tone={row.gpReviewed ? 'teal' : abnormal ? 'coral' : 'amber'}>{row.gpReviewed ? 'Reviewed' : abnormal ? 'Urgent' : 'New'}</Badge>
                </td>
                <td>
                  {patient && (
                    <AppButton size="sm" variant="ghost" onClick={() => setLocation(`/patients/${patient.id}`)}>
                      Review
                    </AppButton>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
      {state.referrals.filter((r) => r.healthlinkRef).map((r) => (
        <p key={r.id} className="mt-2 text-[11px] text-slate-500">
          Referral ack {r.healthlinkRef} · {r.hospital}
        </p>
      ))}
      {!rows.length && <EmptyState title="No matching HealthLink items" detail="The bridge agent pushes ORU/ADT/REF messages here." />}
    </div>
  );
}
