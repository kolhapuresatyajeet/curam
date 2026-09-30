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

export async function saveStripeKeyRemote(
  publishableKey: string,
  secretKey: string,
): Promise<{ ok: true; live: boolean } | { ok: false; error: string }> {
  const { ok, payload } = await authedPost('save-stripe-key', { publishableKey, secretKey });
  if (!ok || !payload.ok) return { ok: false, error: payload.error ?? 'Could not save key' };
  return { ok: true, live: Boolean(payload.live) };
}
