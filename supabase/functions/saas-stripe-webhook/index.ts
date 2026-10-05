// SaaS Stripe webhook — keeps practice billing state in sync with Cúram's own
// subscriptions (checkout sessions + subscription lifecycle). Verifies the
// signature with the platform STRIPE_WEBHOOK_SECRET; configured endpoint in
// the Stripe dashboard → Developers → Webhooks → add
// https://<ref>.supabase.co/functions/v1/saas-stripe-webhook with events:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//
// NOTE: this platform webhook is separate from the existing stripe-webhook
// (practices taking patient payments on their Connect accounts).

import { json } from '../_shared/http.ts';

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=').map((s) => s.trim()) as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return expected === parts.v1;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const signature = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();
  if (!secret || !signature || !(await verifyStripeSignature(payload, signature, secret))) {
    return json({ error: 'Invalid signature' }, 400);
  }

  const event = JSON.parse(payload) as { type: string; data: { object: any } };
  const obj = event.data?.object ?? {};

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  if (event.type === 'checkout.session.completed') {
    const practiceId = obj.client_reference_id as string | undefined;
    if (!practiceId) return json({ received: true });
    const plan = (obj.metadata?.plan as string) ?? 'monthly';
    const code = (obj.metadata?.code as string) || null;
    await admin
      .from('practices')
      .update({ saas_status: 'active', saas_plan: plan, saas_customer_id: obj.customer ?? null })
      .eq('id', practiceId);
    if (code) {
      await admin.from('saas_redemptions').insert({ code, practice_id: practiceId, plan });
      await admin.rpc('saas_bump_code_usage', { p_code: code }).then(null, () => {/* best-effort */});
    }
    return json({ received: true });
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const customerId = obj.customer as string | undefined;
    if (!customerId) return json({ received: true });
    const statusMap: Record<string, string> = {
      trialing: 'trial',
      active: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'canceled',
      incomplete_expired: 'canceled',
    };
    const saasStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : statusMap[obj.status] ?? 'active';
    await admin
      .from('practices')
      .update({
        saas_status: saasStatus,
        ...(obj.current_period_end ? { saas_period_end: new Date(obj.current_period_end * 1000).toISOString() } : {}),
      })
      .eq('saas_customer_id', customerId);
    return json({ received: true });
  }

  return json({ received: true });
});
