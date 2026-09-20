import { cors, json } from '../_shared/http.ts';
import { syncAppointmentToGoogle } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const body = await req.json();
  const appointmentId = String(body.appointmentId ?? '');
  if (!appointmentId) return json({ error: 'appointmentId required' }, 400);

  const admin = createClient(url, service);
  await syncAppointmentToGoogle(admin, appointmentId);
  return json({ synced: true });
});
