Deno.serve(async (req) => {
  const event = await req.json();
  return new Response(JSON.stringify({ processed: true, trigger: event.trigger_event }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
