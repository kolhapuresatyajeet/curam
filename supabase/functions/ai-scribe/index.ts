Deno.serve(async (req) => {
  const { transcript, consent } = await req.json();
  if (!consent) return new Response(JSON.stringify({ error: 'Consent required' }), { status: 400 });
  return new Response(
    JSON.stringify({
      draft: {
        subjective: transcript,
        assessment: 'Pending GP approval',
      },
      requiresApproval: true,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
