const publishable = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export const stripeConfigured = Boolean(publishable);

export function paymentLinkUrl(invoiceId: string, amount: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/pay/${invoiceId}?amount=${amount}`;
}

export function detectBillingSource(medicalCardType: string, insurer?: string) {
  if (medicalCardType === 'gms' || medicalCardType === 'gp_visit') return 'gms' as const;
  if (insurer === 'vhi' || insurer === 'laya' || insurer === 'irish_life' || insurer === 'aviva') {
    return insurer;
  }
  return 'private' as const;
}

async function authedPost(path: string, body: Record<string, unknown>) {
  const { supabase, supabaseConfigured, getSupabaseConfig } = await import('@/lib/supabase');
  if (!supabaseConfigured || !supabase) {
    return { ok: false, payload: { error: 'Supabase is not configured' } };
  }
  const { url, anonKey } = getSupabaseConfig();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, payload: { error: 'Sign in first' } };
  const response = await fetch(`${url}/functions/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    emailed?: boolean;
    ok?: boolean;
    live?: boolean;
  };
  return { ok: response.ok, payload };
}

export async function createPaymentLinkRemote(
  invoiceId: string,
): Promise<{ ok: true; url: string; emailed: boolean } | { ok: false; error: string }> {
  const { ok, payload } = await authedPost('create-payment-link', { invoiceId });
  if (!ok || !payload.url) return { ok: false, error: payload.error ?? 'Payment link failed' };
  return { ok: true, url: payload.url, emailed: Boolean(payload.emailed) };
}

async function authedGet(path: string) {
  const { supabase, supabaseConfigured, getSupabaseConfig } = await import('@/lib/supabase');
  if (!supabaseConfigured || !supabase) return { ok: false, payload: { error: 'Supabase is not configured' } as Record<string, unknown> };
  const { url, anonKey } = getSupabaseConfig();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, payload: { error: 'Sign in first' } };
  const response = await fetch(`${url}/functions/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, payload };
}

/** Current practice's Stripe Connect status (Express hosted onboarding). */
export async function stripeConnectStatus(): Promise<{
  connected: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  status?: string;
}> {
  const { ok, payload } = await authedGet('stripe-connect-onboard');
  if (!ok) return { connected: false };
  return {
    connected: Boolean(payload.connected),
    charges_enabled: payload.charges_enabled as boolean | undefined,
    payouts_enabled: payload.payouts_enabled as boolean | undefined,
    details_submitted: payload.details_submitted as boolean | undefined,
    status: payload.status as string | undefined,
  };
}

/** Start (or restart) Stripe Express onboarding; returns the hosted link. */
export async function stripeConnectOnboard(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { ok, payload } = await authedPost('stripe-connect-onboard', {});
  if (!ok || !payload.url) return { ok: false, error: (payload.error as string) ?? 'Could not start Stripe onboarding' };
  return { ok: true, url: payload.url as string };
}
