import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppButton, SectionTitle, Tabs, inputClass } from '@/components/shared/ui';
import { isPlatformAdmin } from '@/lib/support';
import {
  saasAdminCreateCode,
  saasAdminList,
  saasAdminToggleCode,
  type SaasCode,
  type SaasPracticeBilling,
  type SaasRedemption,
} from '@/lib/saas';
import { formatIrishDate } from '@/lib/utils';
import { Ban, CheckCircle2, Plus } from 'lucide-react';

/** Super-admin console — Cúram's own billing: prices, discount / free-GP /
 *  affiliate codes, redemptions and practice billing state. Only users with
 *  platform_admin = true (Supabase auth metadata) can open it; codes never
 *  leave the Edge Function (the table has no RLS policies on purpose). */
export default function SaasAdminPage() {
  const [, setLocation] = useLocation();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState('Codes');
  const [codes, setCodes] = useState<SaasCode[]>([]);
  const [redemptions, setRedemptions] = useState<SaasRedemption[]>([]);
  const [practices, setPractices] = useState<SaasPracticeBilling[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: '',
    kind: 'percent' as 'percent' | 'free',
    percent_off: 50,
    months: '',
    assigned_email: '',
    max_redemptions: '',
    affiliate: '',
    note: '',
  });

  useEffect(() => {
    void isPlatformAdmin().then(setAllowed);
  }, []);

  const load = () => {
    setBusy(true);
    saasAdminList()
      .then((data) => {
        setCodes(data.codes);
        setRedemptions(data.redemptions);
        setPractices(data.practices);
        setError('');
      })
      .catch((e) => setError(String((e as Error).message)))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);

  async function createCode() {
    setBusy(true);
    setError('');
    try {
      await saasAdminCreateCode({
        code: form.code,
        kind: form.kind,
        percent_off: form.kind === 'percent' ? Number(form.percent_off) : undefined,
        months: form.months ? Number(form.months) : undefined,
        assigned_email: form.assigned_email.trim() || undefined,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : undefined,
        affiliate: form.affiliate.trim() || undefined,
        note: form.note.trim() || undefined,
      });
      setForm({ ...form, code: '', note: '' });
      load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null) return <p className="p-8 text-[12px] text-slate-500">Checking access…</p>;
  if (!allowed) return <Emptyish />;

  return (
    <div className="fade-in">
      <SectionTitle
        title="SaaS admin"
        description="Cúram's own billing — €99/month or €990/year per practice. Free practices redeem an email-locked code: only a signup with that exact email can use it."
      />
      <button type="button" className="mb-2 text-xs text-purple-700 underline" onClick={() => setLocation('/support')}>
        ← Back to support console
      </button>
      <Tabs items={['Codes', 'Redemptions', 'Practices']} value={tab} onChange={setTab} />

      {error && <p className="mb-3 text-[12px] text-[#b5443b]" role="alert">{error}</p>}

      {tab === 'Codes' && (
        <>
          <div className="surface max-w-3xl rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-800">Create a code</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input aria-label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CODE — e.g. FOUNDER-MURPHY" className={inputClass} />
              <select aria-label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'percent' | 'free' })} className={inputClass}>
                <option value="percent">Percent discount</option>
                <option value="free">Free practice (100% forever)</option>
              </select>
              {form.kind === 'percent' && (
                <>
                  <input aria-label="Percent off" type="number" min={1} max={100} value={form.percent_off} onChange={(e) => setForm({ ...form, percent_off: Number(e.target.value) })} placeholder="% off" className={inputClass} />
                  <input aria-label="Months" type="number" min={1} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} placeholder="Months (blank = forever)" className={inputClass} />
                </>
              )}
              <input aria-label="Assigned email" value={form.assigned_email} onChange={(e) => setForm({ ...form, assigned_email: e.target.value })} placeholder="Lock to email (blank = public)" className={inputClass} />
              <input aria-label="Max redemptions" type="number" min={1} value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} placeholder="Max uses (blank = unlimited)" className={inputClass} />
              <input aria-label="Affiliate" value={form.affiliate} onChange={(e) => setForm({ ...form, affiliate: e.target.value })} placeholder="Affiliate (advocate for payout)" className={inputClass} />
              <input aria-label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (internal)" className={inputClass} />
            </div>
            <AppButton size="sm" variant="primary" onClick={() => void createCode()} disabled={busy || !form.code.trim()}>
              <Plus size={13} /> Create code
            </AppButton>
          </div>

          <div className="surface mt-4 divide-y rounded-xl">
            {codes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-40">
                  <p className="text-sm font-semibold text-slate-800">{c.code}</p>
                  <p className="text-[11px] text-slate-500">
                    {c.kind === 'free' ? 'Free practice' : `${c.percent_off}% off${c.months ? ` for ${c.months} months` : ' forever'}`}
                    {' · '}
                    {c.times_used}{c.max_redemptions ? `/${c.max_redemptions}` : ''} used
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">{c.assigned_email ? `🔒 ${c.assigned_email}` : 'Public code'}</p>
                {c.affiliate && <p className="text-[11px] text-slate-500">Affiliate: {c.affiliate}</p>}
                {c.note && <p className="text-[11px] italic text-slate-400">{c.note}</p>}
                <div className="ml-auto">
                  <AppButton
                    size="sm"
                    variant={c.active ? 'ghost' : 'primary'}
                    onClick={() => {
                      setBusy(true);
                      saasAdminToggleCode(c.id, !c.active).then(load).catch((e) => setError(String((e as Error).message))).finally(() => setBusy(false));
                    }}
                    disabled={busy}
                  >
                    {c.active ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                    {c.active ? 'Disable' : 'Enable'}
                  </AppButton>
                </div>
              </div>
            ))}
            {codes.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-slate-500">No codes yet — create the first one above.</p>}
          </div>
        </>
      )}

      {tab === 'Redemptions' && (
        <div className="surface divide-y rounded-xl">
          {redemptions.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 px-4 py-3 text-[12px]">
              <p className="font-semibold text-slate-800">{r.code}</p>
              <p className="text-slate-500">{r.email ?? r.practice_id}</p>
              <p className="text-slate-500">{r.plan}</p>
              <p className="ml-auto text-slate-400">{formatIrishDate(r.created_at)}</p>
            </div>
          ))}
          {redemptions.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-slate-500">No redemptions yet.</p>}
        </div>
      )}

      {tab === 'Practices' && (
        <div className="surface divide-y rounded-xl">
          {practices.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-4 px-4 py-3 text-[12px]">
              <p className="font-semibold text-slate-800">{p.name}</p>
              <p className="text-slate-500">{p.saas_status}</p>
              <p className="text-slate-500">{p.saas_plan ?? ''}</p>
              <p className="ml-auto text-slate-400">{p.saas_period_end ? `renews ${formatIrishDate(p.saas_period_end)}` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Emptyish() {
  return (
    <div className="p-8">
      <p className="text-[12px] text-slate-500">Platform admin access required. Your account needs platform_admin = true in its Supabase auth metadata.</p>
    </div>
  );
}
