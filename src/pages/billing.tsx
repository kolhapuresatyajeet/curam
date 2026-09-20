import { useMemo, useState } from 'react';
import { AppButton, Badge, SectionTitle, TableShell, Tabs } from '@/components/shared/ui';
import { formatEur, formatIrishDate } from '@/lib/utils';
import { paymentLinkUrl } from '@/lib/stripe';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName, type InvoiceStatus } from '@/types/domain';

function agingDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function BillingPage() {
  const state = useAppState();
  const [tab, setTab] = useState('Overview');
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const invoices = useMemo(
    () => state.invoices.filter((item) => status === 'all' || item.status === status),
    [state.invoices, status],
  );
  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + (i.amount - i.paidAmount), 0);

  return (
    <div className="fade-in">
      <SectionTitle title="Billing" description={`Outstanding ${formatEur(outstanding)}. Aging buckets 7 / 14 / 21 / 30 days.`} />
      <Tabs items={['Overview', 'PCRS claims', 'Insurer claims', 'Payments']} value={tab} onChange={setTab} />
      {tab === 'Overview' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['all', 'unbilled', 'invoiced', 'partial', 'paid', 'rejected'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-md px-3 py-1.5 text-[11px] ${status === item ? 'bg-teal-50 text-teal-800' : 'text-slate-400'}`}>
                {item}
              </button>
            ))}
          </div>
          <TableShell>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Source</th>
                <th>Billed</th>
                <th>Paid</th>
                <th>Unpaid</th>
                <th>Aging</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const patient = state.patients.find((p) => p.id === inv.patientId);
                const unpaid = inv.amount - inv.paidAmount;
                const age = agingDays(inv.issuedAt);
                return (
                  <tr key={inv.id}>
                    <td>{formatIrishDate(inv.issuedAt)}</td>
                    <td>{patient ? patientName(patient) : inv.patientId}</td>
                    <td>{inv.billingSource}</td>
                    <td>{formatEur(inv.amount)}</td>
                    <td>{formatEur(inv.paidAmount)}</td>
                    <td>{formatEur(unpaid)}</td>
                    <td>{unpaid ? `${age}d` : '—'}</td>
                    <td>
                      <Badge tone={inv.status === 'paid' ? 'teal' : inv.status === 'rejected' ? 'coral' : 'amber'}>{inv.status}</Badge>
                    </td>
                    <td>
                      {unpaid > 0 && (
                        <AppButton size="sm" onClick={() => appStore.payInvoice(inv.id, unpaid)}>
                          Record payment
                        </AppButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </>
      )}
      {tab === 'PCRS claims' && (
        <div className="surface divide-y rounded-xl">
          {state.pcrsClaims.map((claim) => (
            <div key={claim.id} className="flex items-center gap-3 px-4 py-3 text-xs">
              <span className="flex-1">{claim.stcCode} · {claim.status} {claim.rejectionReason ? `· ${claim.rejectionReason}` : ''}</span>
              {claim.status === 'staged' && (
                <AppButton size="sm" onClick={() => appStore.submitPcrs(claim.id)}>
                  Submit
                </AppButton>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === 'Insurer claims' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {['vhi', 'laya', 'irish_life', 'aviva'].map((insurer) => {
            const list = state.invoices.filter((i) => i.billingSource === insurer);
            const total = list.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={insurer} className="surface rounded-xl p-4">
                <div className="text-sm font-semibold capitalize">{insurer.replace('_', ' ')}</div>
                <div className="text-xs text-slate-500">{list.length} claims · {formatEur(total)}</div>
                <p className="mt-2 text-[11px] text-slate-400">Claim file generation is staged for portal upload. Automation comes after GPIT.</p>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'Payments' && (
        <div className="surface divide-y rounded-xl">
          {state.invoices.filter((i) => i.paidAmount > 0).map((inv) => (
            <div key={inv.id} className="px-4 py-3 text-xs">
              {inv.stripePaymentId} · {formatEur(inv.paidAmount)} · link {paymentLinkUrl(inv.id, inv.amount - inv.paidAmount)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
