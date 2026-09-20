import { appOrigin, readOAuthState, exchangeCode, googleEmail, ensureCuramCalendar, saveGoogleConnection } from '../_shared/google-calendar.ts';

function redirect(location: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${location}"><title>Cúram</title></head><body><p>Returning to Cúram…</p><a href="${location}">Continue</a><script>location.replace(${JSON.stringify(location)})</script></body></html>`,
    {
      status: 302,
      headers: {
        Location: location,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

Deno.serve(async (req) => {
  const fallback = appOrigin(Deno.env.get('PUBLIC_APP_URL'));
  try {
    const url = new URL(req.url);
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const payload = state ? await readOAuthState(state) : null;
    const origin = appOrigin(payload?.origin ?? fallback);
    const settings = `${origin}/settings?google=`;

    if (error) return redirect(`${settings}error`);
    if (!payload || !code) return redirect(`${settings}error`);

    const tokens = await exchangeCode(code);
    if (!tokens.access_token) return redirect(`${settings}error`);

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: staff } = await admin.from('staff').select('id, name, google_calendar_id').eq('id', payload.staffId).maybeSingle();
    if (!staff) return redirect(`${settings}error`);

    const email = await googleEmail(tokens.access_token);
    const calendar = await ensureCuramCalendar(tokens.access_token, staff.name, staff.google_calendar_id);
    await saveGoogleConnection(admin, staff.id, tokens, calendar, email);
    return redirect(`${settings}connected`);
  } catch {
    return redirect(`${fallback}/settings?google=error`);
  }
});
