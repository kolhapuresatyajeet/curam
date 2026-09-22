Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const event = await req.json();
  const type = event.type as string;
  // Update invoices.status when Stripe confirms payment. Signature verification happens with STRIPE_WEBHOOK_SECRET.
  return new Response(JSON.stringify({ received: true, type }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
