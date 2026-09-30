import { cors, json } from '../_shared/http.ts';

// Called by pg_cron every 15 minutes (or any external scheduler).
// Requires header `x-cron-key` matching the CRON_SECRET edge secret.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const cronKey = Deno.env.get('CRON_SECRET') ?? '';
  if (!cronKey) return json({ error: 'CRON_SECRET not configured' }, 503);
  if ((req.headers.get('x-cron-key') ?? '') !== cronKey) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, service);

  const { sendReminders } = await import('../_shared/sms.ts');
  const results = {
    '48h': await sendReminders(admin, '48h'),
    '2h': await sendReminders(admin, '2h'),
  };

  return json({ ok: true, ...results });
});
