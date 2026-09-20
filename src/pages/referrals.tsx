import { AppButton, Badge, SectionTitle, Tabs } from '@/components/shared/ui';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';
import { useState } from 'react';

export default function ReferralsPage() {
  const state = useAppState();
  const [tab, setTab] = useState('Active');
  const rows = state.referrals.filter((item) => (tab === 'Drafts' ? item.status === 'draft' : item.status !== 'draft'));

  return (
    <div className="fade-in">
      <SectionTitle title="Referrals" description="Outgoing eReferrals wait for the HealthLink bridge. Síle drafts need GP approval." />
      <Tabs items={['Active', 'Drafts']} value={tab} onChange={setTab} />
      <div className="surface divide-y rounded-xl">
        {rows.map((item) => {
          const patient = state.patients.find((p) => p.id === item.patientId);
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-4">
              <div className="flex-1">
                <div className="flex gap-2">
                  <span className="text-xs font-semibold">{patient ? patientName(patient) : ''} · {item.specialty}</span>
                  <Badge tone={item.status === 'draft' ? 'amber' : 'teal'}>{item.status}</Badge>
                  {item.sileDrafted && <Badge tone="purple">Síle draft</Badge>}
                </div>
                <p className="text-[11px] text-slate-500">{item.hospital} · {item.notes}</p>
              </div>
              {item.status === 'draft' && (
                <AppButton size="sm" variant="primary" onClick={() => appStore.updateReferralStatus(item.id, 'sent')}>
                  Approve & send
                </AppButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
