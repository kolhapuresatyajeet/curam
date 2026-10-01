import { cors, json } from '../_shared/http.ts';

// Stripe Connect (Express): GPs connect their own Stripe account with one
// click. POST returns a Stripe-hosted onboarding link; GET returns the
// practice's connection status. The practice's keys never touch Cúram —
// payments are later created in their account via the Stripe-Account header.
// Requires the platform STRIPE_SECRET_KEY secret (test or live).
// GP / practice-manager only.

async function stripePost(path: string, platformKey: string, form: URLSearchParams, accountHeader?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${platformKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (accountHeader) headers['Stripe-Account'] = accountHeader;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers, body: form });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

async function stripeGet(path: string, platformKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${platformKey}` } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin
    .from('staff')
    .select('practice_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return json({ error: 'No practice linked to this account' }, 403);

  // GET = connection status (any staff role may view).
  if (req.method === 'GET') {
    const { data: practice } = await admin
      .from('practices')
      .select('stripe_account_id, stripe_connected_at')
      .eq('id', staff.practice_id)
      .maybeSingle();
    if (!practice?.stripe_account_id) return json({ connected: false });

    const platformKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    if (!platformKey) return json({ connected: true, status: 'unknown' });
    const acct = await stripeGet(`accounts/${practice.stripe_account_id}`, platformKey);
    if (!acct.ok) return json({ connected: true, status: 'unreachable', error: acct.body?.error?.message });
    if (acct.body.details_submitted && !practice.stripe_connected_at) {
      await admin.from('practices').update({ stripe_connected_at: new Date().toISOString() }).eq('id', staff.practice_id);
    }
    return json({
      connected: true,
      status: 'ok',
      charges_enabled: acct.body.charges_enabled ?? false,
      payouts_enabled: acct.body.payouts_enabled ?? false,
      details_submitted: acct.body.details_submitted ?? false,
    });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // POST = start/restart onboarding (GP or practice manager only).
  if (!['gp', 'pm'].includes(staff.role ?? '')) {
    return json({ error: 'Only a GP or practice manager can connect Stripe' }, 403);
  }

  const platformKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!platformKey) return json({ error: 'Stripe is not configured on the platform' }, 503);

  const { data: practice } = await admin
    .from('practices')
    .select('id, name, stripe_account_id')
    .eq('id', staff.practice_id)
    .maybeSingle();
  if (!practice) return json({ error: 'Practice not found' }, 404);

  // Reuse the connected account if we have one and it still exists; else create.
  let accountId: string | null = practice.stripe_account_id ?? null;
  if (accountId) {
    const existing = await stripeGet(`accounts/${accountId}`, platformKey);
    if (!existing.ok) accountId = null;
  }
  if (!accountId) {
    const created = await stripePost('accounts', platformKey, new URLSearchParams({
      type: 'express',
      country: 'IE',
      'business_profile[name]': practice.name ?? 'GP Practice',
      'metadata[practice_id]': practice.id,
      'metadata[platform]': 'curam',
    }));
    if (!created.ok) return json({ error: created.body?.error?.message ?? 'Could not create Stripe account' }, 502);
    accountId = created.body.id as string;
    await admin
      .from('practices')
      .update({ stripe_account_id: accountId })
      .eq('id', practice.id);
  }

  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? '';
  if (!appUrl.startsWith('https://')) {
    return json({ error: 'PUBLIC_APP_URL secret must be set to the live app URL (https://…)' }, 503);
  }
  const link = await stripePost('account_links', platformKey, new URLSearchParams({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${appUrl}/settings?stripe=refresh`,
    return_url: `${appUrl}/settings?stripe=return`,
  }));
  if (!link.ok) return json({ error: link.body?.error?.message ?? 'Could not create onboarding link' }, 502);

  return json({ url: link.body.url as string });
});
