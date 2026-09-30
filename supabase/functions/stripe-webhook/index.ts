// Real Stripe webhook: verifies the signature with STRIPE_WEBHOOK_SECRET
// (HMAC-SHA256 over "{timestamp}.{payload}") and marks invoices paid.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type, stripe-signature' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;
  // 5-minute tolerance, per Stripe docs.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return hex(mac) === signature;
}

async function markInvoicePaid(admin: any, invoiceId: string, amountPaidCents: number, paymentId: string) {
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, amount, paid_amount, status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return { error: 'invoice not found' };
  const paid = Number(invoice.paid_amount) + amountPaidCents / 100;
  const total = Number(invoice.amount);
  const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : invoice.status;
  const { error } = await admin
    .from('invoices')
    .update({ paid_amount: paid, status, stripe_payment_id: paymentId })
    .eq('id', invoice.id);
  return { error: error?.message };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const signatureHeader = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();

  if (secret) {
    const valid = await verifyStripeSignature(payload, signatureHeader, secret);
    if (!valid) return json({ error: 'Invalid signature' }, 400);
  }

  const event = JSON.parse(payload);
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let result: { error?: string } = {};
  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object ?? {};
    const invoiceId = session.client_reference_id ?? session.metadata?.invoice_id;
    if (invoiceId && session.payment_status === 'paid') {
      result = await markInvoicePaid(admin, invoiceId, session.amount_total ?? 0, session.payment_intent ?? session.id);
    }
  } else if (event.type === 'payment_intent.succeeded') {
    const intent = event.data?.object ?? {};
    const invoiceId = intent.metadata?.invoice_id;
    if (invoiceId) result = await markInvoicePaid(admin, invoiceId, intent.amount ?? 0, intent.id);
  }

  return json({ received: true, type: event.type, ...result });
});
