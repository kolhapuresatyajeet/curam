Deno.serve(async (req) => {
  const payload = await req.json();
  if (payload.abnormal && payload.deliveryMethod === 'sile') {
    return new Response(JSON.stringify({ error: 'Abnormal results cannot be AI-delivered' }), { status: 400 });
  }
  return new Response(JSON.stringify({ ingested: true }), { headers: { 'Content-Type': 'application/json' } });
});
