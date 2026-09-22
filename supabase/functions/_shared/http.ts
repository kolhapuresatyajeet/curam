export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-booking-key',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function requireVoiceKey(req: Request) {
  const bookingKey = Deno.env.get('BOOKING_API_KEY') ?? '';
  const provided = req.headers.get('x-booking-key') ?? '';
  if (!bookingKey) return json({ error: 'Voice booking is not configured' }, 503);
  if (provided !== bookingKey) return json({ error: 'Voice agent key required' }, 401);
  return null;
}
