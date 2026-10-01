import { cors, json } from '../_shared/http.ts';

// Creates a real Stripe Payment Link for an invoice in the practice's own
// Stripe account (Stripe Connect; platform key fallback for demos) and stores
// the URL on the invoice. Emails the patient.

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
  const { data: staff } = await admin.from('staff').select('practice_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  if (!staff) return json({ error: 'No practice linked to this account' }, 403);

  const { invoiceId } = await req.json();
  if (!invoiceId) return json({ error: 'invoiceId required' }, 400);

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, practice_id, amount, paid_amount, status, description, patients(first_name, last_name, email)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice || invoice.practice_id !== staff.practice_id) return json({ error: 'Invoice not found' }, 404);
  if (invoice.status === 'paid') return json({ error: 'Invoice is already paid' }, 409);

  // Key resolution, most-to-least specific:
  //  1. practice_billing_keys.stripe_secret_key — manually-pasted legacy key
  //  2. platform STRIPE_SECRET_KEY + Stripe-Account header (Stripe Connect:
  //     the practice's own connected account — money lands with the practice)
  //  3. platform key alone (demo/test fallback account)
  const platformKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const { data: keys } = await admin
    .from('practice_billing_keys')
    .select('stripe_secret_key')
    .eq('practice_id', staff.practice_id)
    .maybeSingle();
  const { data: practice } = await admin
    .from('practices')
    .select('stripe_account_id')
    .eq('id', staff.practice_id)
    .maybeSingle();

  let stripeKey: string | null = null;
  let accountHeader: string | undefined;
  let keySource: 'practice_key' | 'connect' | 'platform' = 'platform';
  if (keys?.stripe_secret_key) {
    stripeKey = keys.stripe_secret_key;
    keySource = 'practice_key';
  } else if (practice?.stripe_account_id && platformKey) {
    stripeKey = platformKey;
    accountHeader = practice.stripe_account_id;
    keySource = 'connect';
  } else if (platformKey) {
    stripeKey = platformKey;
  }
  if (!stripeKey) {
    return json({ error: 'Stripe is not connected. The practice can connect Stripe in Settings → Integrations.' }, 503);
  }

  const unpaid = Math.round((Number(invoice.amount) - Number(invoice.paid_amount)) * 100);
  if (unpaid <= 0) return json({ error: 'Nothing left to pay' }, 409);

  const patient = Array.isArray(invoice.patients) ? invoice.patients[0] : invoice.patients;
  const description = invoice.description ?? 'GP appointment fee';

  const form = new URLSearchParams();
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'eur');
  form.set('line_items[0][price_data][unit_amount]', String(unpaid));
  form.set('line_items[0][price_data][product_data][name]', description);
  form.set('metadata[invoice_id]', invoice.id);
  form.set('client_reference_id', invoice.id);
  form.set('after_completion[type]', 'hosted_confirmation');
  form.set('after_completion[hosted_confirmation][custom_message]', 'Thank you — your payment has been received by the practice.');

  const response = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(accountHeader ? { 'Stripe-Account': accountHeader } : {}),
    },
    body: form,
  });
  const link = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: link.error?.message ?? `Stripe error (HTTP ${response.status})` }, 502);

  await admin.from('invoices').update({ payment_link_url: link.url }).eq('id', invoice.id);

  // Email the patient the link (never blocks link creation).
  let emailed = false;
  if (patient?.email?.includes('@')) {
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
      const from = Deno.env.get('RESEND_FROM') ?? 'Cúram <beth.t@example.com>';
      if (resendKey) {
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [patient.email],
            subject: `Payment link — ${description}`,
            text: `Hello ${patient.first_name ?? ''},\n\nYour practice has issued an invoice of €${(unpaid / 100).toFixed(2)} for ${description.toLowerCase()}.\n\nPay securely online: ${link.url}\n\nCúram`,
          }),
        });
        emailed = send.ok;
      }
    } catch {
      /* best-effort */
    }
  }

  return json({ url: link.url, emailed, keySource });
});
