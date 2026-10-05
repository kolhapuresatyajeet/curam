// SaaS checkout — starts a GP practice's subscription (€99/mo or €990/yr) or
// applies a code. GP / practice-manager only.
//
//   POST { plan: 'monthly' | 'yearly', code?: string }
//
//   - kind 'free' code (email-locked) → practice becomes free immediately,
//     no Stripe involved.
//   - percent code → Stripe Checkout Session with the discount attached.
//   - no code → Stripe Checkout with a 14-day trial.
//
// Emails: an assigned code can ONLY be redeemed by the exact practice email —
// the checkout is created with customer_email locked to that address, and the
// practice's user email is checked before anything else. Prices come from the
// STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY secrets (created in the Stripe
// dashboard) — prices are never hardcoded in the app.

import { cors, json } from '../_shared/http.ts';

const TRIAL_DAYS = Number(Deno.env.get('SAAS_TRIAL_DAYS') ?? '14');

async function stripePost(path: string, key: string, form: URLSearchParams) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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
  if (!['gp', 'pm'].includes(staff.role ?? '')) return json({ error: 'Only a GP or practice manager can manage billing' }, 403);

  const { data: practice } = await admin
    .from('practices')
    .select('id, name, saas_status')
    .eq('id', staff.practice_id)
    .maybeSingle();
  if (!practice) return json({ error: 'Practice not found' }, 404);

  const body = await req.json().catch(() => ({}));
  const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';
  const codeInput = String(body.code ?? '').trim().toUpperCase().replace(/\s+/g, '-');
  const email = (userData.user.email ?? '').toLowerCase();

  // Free codes (email-locked) — no Stripe at all.
  if (codeInput) {
    const { data: code } = await admin.from('saas_codes').select('*').eq('code', codeInput).maybeSingle();
    if (!code || !code.active) return json({ error: 'That code is not valid' }, 400);
    if (code.assigned_email && code.assigned_email !== email) {
      return json({ error: 'This code is assigned to a different email address' }, 403);
    }
    if (code.max_redemptions !== null && code.times_used >= code.max_redemptions) {
      return json({ error: 'This code has reached its redemption limit' }, 400);
    }
    if (code.kind === 'free') {
      await admin
        .from('practices')
        .update({ saas_status: 'free', saas_plan: 'free' })
        .eq('id', practice.id);
      await admin.from('saas_codes').update({ times_used: code.times_used + 1 }).eq('id', code.id);
      await admin.from('saas_redemptions').insert({ code: code.code, practice_id: practice.id, email, plan: 'free' });
      await admin.from('audit_log').insert({
        practice_id: practice.id,
        user_id: userData.user.id,
        action: 'saas_code_redeemed',
        entity_type: 'saas_code',
        entity_id: code.id,
        details_json: { code: code.code, kind: 'free' },
      });
      return json({ free: true });
    }
  }

  // Percent code or plain checkout → Stripe.
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!key) return json({ error: 'Billing is not configured on the platform yet' }, 503);
  const price = plan === 'yearly' ? Deno.env.get('STRIPE_PRICE_YEARLY') : Deno.env.get('STRIPE_PRICE_MONTHLY');
  if (!price) return json({ error: 'Billing prices are not configured yet' }, 503);
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? '';
  if (!appUrl.startsWith('https://')) return json({ error: 'PUBLIC_APP_URL secret must be set' }, 503);

  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    customer_email: email,
    client_reference_id: practice.id,
    'metadata[practice_id]': practice.id,
    'metadata[plan]': plan,
    'metadata[code]': codeInput,
    success_url: `${appUrl}/billing?saas=success`,
    cancel_url: `${appUrl}/billing?saas=cancel`,
    'subscription_data[metadata][practice_id]': practice.id,
  });
  // Trial only for undiscounted signups — no stacking a discount on a trial.
  if (codeInput) {
    const { data: code } = await admin.from('saas_codes').select('*').eq('code', codeInput).maybeSingle();
    if (code?.kind === 'percent') {
      // Find/create the matching Stripe coupon for this code.
      const couponId = `curam-${code.code.toLowerCase()}`;
      const existing = await fetch(`https://api.stripe.com/v1/coupons/${couponId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!existing.ok) {
        const created = await stripePost('coupons', key, new URLSearchParams({
          id: couponId,
          percent_off: String(code.percent_off ?? 0),
          duration: code.months ? 'repeating' : 'forever',
          ...(code.months ? { duration_in_months: String(code.months) } : {}),
        }));
        if (!created.ok) return json({ error: created.body?.error?.message ?? 'Could not create discount' }, 502);
      }
      form.set('discounts[0][coupon]', couponId);
    }
  } else {
    form.set('subscription_data[trial_period_days]', String(TRIAL_DAYS));
  }

  const session = await stripePost('checkout/sessions', key, form);
  if (!session.ok) return json({ error: session.body?.error?.message ?? 'Could not start checkout' }, 502);
  return json({ url: session.body.url as string });
});
