import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'wouter';
import { AppButton, EmptyState, SectionTitle } from '@/components/shared/ui';
import { useAppState } from '@/stores/appStore';
import { canManagePractice } from '@/lib/roles';
import { fetchSaasBilling, openBillingPortal, startCheckout, type SaasBilling } from '@/lib/saas';
import { formatIrishDate } from '@/lib/utils';
import { CheckCircle2, CreditCard, Sparkles } from 'lucide-react';

const STATUS_LABEL: Record<SaasBilling['saasStatus'], string> = {
  none: 'No subscription yet',
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment failed — update your card',
  free: 'Free practice',
  canceled: 'Canceled',
};

/** Billing page — the practice pays for Cúram (€99/mo or €990/yr). GP/PM only
 *  gets actions; other staff see the status. Clinical data is never gated on
 *  payment — a lapsed subscription shows a banner, not a lockout. */
export default function BillingPage() {
  const state = useAppState();
  const me = state.staff.find((member) => member.id === state.session?.staffId);
  const canManage = canManagePractice(me?.role);
  const [, setSearchParams] = useSearchParams();
  const [, setLocation] = useLocation();
  const [billing, setBilling] = useState<SaasBilling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    void fetchSaasBilling(state.practice.id).then(setBilling);
  }, [state.practice.id]);

  useEffect(refresh, [refresh]);

  // Returning from Stripe Checkout.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('saas');
    if (result === 'success') setMessage('Subscription started — thank you. Welcome to Cúram.');
    if (result === 'cancel') setError('Checkout was cancelled — nothing was charged.');
    if (result) setLocation('/billing', { replace: true });  }, [setLocation]);

  async function choose(plan: 'monthly' | 'yearly') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await startCheckout(plan, code.trim() || undefined);
      if (result.free) {
        setMessage('Code accepted — this practice is on the free plan.');
        refresh();
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setError('');
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const status = billing?.saasStatus ?? 'none';
  const settled = status === 'active' || status === 'free';

  return (
    <div className="fade-in">
      <SectionTitle title="Billing" description="Cúram subscription for the whole practice. Every plan covers all your staff — no per-seat fees." />
      {!canManage && (
        <p className="mb-3 text-[12px] text-slate-500">Only the GP or practice manager can change billing.</p>
      )}

      <div className="surface max-w-2xl rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span className={`icon-box ${settled ? 'icon-teal' : status === 'past_due' ? 'icon-coral' : 'icon-amber'}`}>
            <CheckCircle2 size={15} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">{STATUS_LABEL[status]}</p>
            <p className="text-[11px] text-slate-500">
              {billing?.saasPlan === 'monthly' && '€99 per month'}
              {billing?.saasPlan === 'yearly' && '€990 per year'}
              {billing?.saasPlan === 'free' && 'Complimentary practice'}
              {billing?.saasPeriodEnd && status === 'active' && ` · renews ${formatIrishDate(billing.saasPeriodEnd)}`}
              {status === 'trial' && ' — trial in progress'}
            </p>
          </div>
          {(status === 'active' || status === 'past_due' || status === 'trial') && canManage && (
            <AppButton size="sm" onClick={() => void portal()} disabled={busy}>
              <CreditCard size={13} /> Manage billing
            </AppButton>
          )}
        </div>
      </div>

      {canManage && !settled && (
        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
          {(['monthly', 'yearly'] as const).map((plan) => (
            <div key={plan} className="surface rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-800">{plan === 'monthly' ? 'Monthly' : 'Yearly'}</p>
              <p className="mt-1 text-[21px] font-semibold text-slate-800">
                €{plan === 'monthly' ? '99' : '990'}
                <span className="text-[12px] font-normal text-slate-500">/{plan === 'monthly' ? 'month' : 'year'}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{plan === 'yearly' ? 'Two months free' : 'Cancel anytime'}</p>
              <div className="mt-3">
                <AppButton size="sm" variant="primary" onClick={() => void choose(plan)} disabled={busy}>
                  <Sparkles size={13} /> Choose {plan}
                </AppButton>
              </div>
            </div>
          ))}
          <div className="sm:col-span-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Discount or invitation code (optional)"
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px] outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}

      {message && <p className="mt-3 max-w-2xl text-[12px] text-teal-700">{message}</p>}
      {error && <p className="mt-3 max-w-2xl text-[12px] text-[#b5443b]" role="alert">{error}</p>}

      {status === 'none' && !canManage && (
        <EmptyState title="No subscription yet" detail="The GP or practice manager sets up billing here." />
      )}
    </div>
  );
}
