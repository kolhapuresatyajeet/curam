// SaaS billing portal — creates a Stripe Billing Portal session so a GP or
// practice manager can update their card, download invoices or cancel without
// us building any of it. Requires the billing portal to be enabled once in the
// Stripe dashboard → Settings → Billing → Customer portal.

import { cors, json } from '../_shared/http.ts';

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
    .select('id, saas_customer_id')
    .eq('id', staff.practice_id)
    .maybeSingle();
  if (!practice?.saas_customer_id) return json({ error: 'No subscription yet — choose a plan first' }, 400);

  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!key) return json({ error: 'Billing is not configured on the platform yet' }, 503);
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? '';

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      customer: practice.saas_customer_id,
      return_url: `${appUrl}/billing`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: body?.error?.message ?? 'Could not open billing portal' }, 502);
  return json({ url: body.url as string });
});
