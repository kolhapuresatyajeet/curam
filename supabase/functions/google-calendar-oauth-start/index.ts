import { cors, json } from '../_shared/http.ts';
import { appOrigin, googleAuthUrl, signOAuthState } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') || !Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')) {
    return json({ error: 'Google Calendar is not configured.' }, 503);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin.from('staff').select('id').eq('user_id', userData.user.id).maybeSingle();
  if (!staff) return json({ error: 'No staff profile is linked to this Google login' }, 403);

  let requestedOrigin = Deno.env.get('PUBLIC_APP_URL') ?? 'http://localhost:4173';
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      if (body.origin) requestedOrigin = String(body.origin);
    } catch {
      /* keep default */
    }
  } else {
    requestedOrigin = new URL(req.url).searchParams.get('origin') ?? requestedOrigin;
  }

  const origin = appOrigin(requestedOrigin);
  const state = await signOAuthState({ staffId: staff.id, origin });
  return json({ url: googleAuthUrl(state) });
});
