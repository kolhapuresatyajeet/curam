Deno.serve(async (req) => {
  const { stcCode, patientId } = await req.json();
  return new Response(JSON.stringify({ staged: true, stcCode, patientId }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
