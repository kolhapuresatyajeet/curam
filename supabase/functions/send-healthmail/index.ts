Deno.serve(async (req) => {
  const { approvedByRole } = await req.json();
  if (approvedByRole !== 'gp' && approvedByRole !== 'locum') {
    return new Response(JSON.stringify({ error: 'GP approval required' }), { status: 403 });
  }
  return new Response(JSON.stringify({ queued: true, transport: 'healthmail.ie TLS' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
