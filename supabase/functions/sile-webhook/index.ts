const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-booking-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const bookingKey = Deno.env.get('BOOKING_API_KEY') ?? '';
  const provided = req.headers.get('x-booking-key') ?? '';
  if (!bookingKey) return json({ error: 'Voice booking is not configured' }, 503);
  if (provided !== bookingKey) return json({ error: 'Voice agent key required' }, 401);

  const body = await req.json();
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, service);

  const practiceId = body.practiceId as string | undefined;
  const patientId = body.patientId as string | undefined;
  if (!practiceId) {
    return json({ error: 'practiceId is required. Bookings go to /functions/v1/book-appointment.' }, 400);
  }

  const { data, error } = await admin
    .from('sile_calls')
    .insert({
      practice_id: practiceId,
      patient_id: patientId ?? null,
      direction: body.direction === 'outbound' ? 'outbound' : 'inbound',
      purpose: body.purpose ?? 'other',
      transcript: String(body.transcript ?? body.summary ?? ''),
      outcome: String(body.outcome ?? 'logged'),
      duration_seconds: Number(body.durationSeconds ?? 0),
      recording_url: body.recordingUrl ?? null,
    })
    .select('id')
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ logged: true, callId: data.id });
});
