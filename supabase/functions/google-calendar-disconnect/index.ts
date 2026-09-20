import { cors, json } from '../_shared/http.ts';
import { disconnectGoogle } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin.from('staff').select('id').eq('user_id', userData.user.id).maybeSingle();
  if (!staff) return json({ error: 'No staff profile' }, 403);
  await disconnectGoogle(admin, staff.id);
  return json({ disconnected: true });
});
