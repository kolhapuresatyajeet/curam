// SaaS admin — super-admin console API for Cúram's own billing.
// Manages discount / free-GP / affiliate codes and shows practice billing
// state. Access requires a signed-in user whose auth metadata carries
// platform_admin = true (same gate as the support console).
//
//   GET                                → codes + redemptions + practice billing
//   POST { action: 'create_code', … }  → new discount / free / affiliate code
//   POST { action: 'toggle_code', id, active } → enable/disable a code
//
// Codes live in saas_codes, which has NO RLS policies — this function (service
// role) is the only door, so the codes can never leak through table reads.

import { cors, json } from '../_shared/http.ts';

interface CodeRow {
  id: string;
  code: string;
  kind: string;
  percent_off: number | null;
  months: number | null;
  assigned_email: string | null;
  max_redemptions: number | null;
  times_used: number;
  affiliate: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  const meta = (userData?.user?.user_metadata ?? {}) as { platform_admin?: boolean; email?: string };
  if (meta.platform_admin !== true) return json({ error: 'Platform admin access required' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  // GET → codes, redemptions, practice billing overview
  if (req.method === 'GET') {
    const [codes, redemptions, practices] = await Promise.all([
      admin.from('saas_codes').select('*').order('created_at', { ascending: false }),
      admin.from('saas_redemptions').select('*').order('created_at', { ascending: false }).limit(200),
      admin
        .from('practices')
        .select('id, name, saas_status, saas_plan, saas_period_end')
        .order('name'),
    ]);
    if (codes.error) return json({ error: codes.error.message }, 500);
    if (redemptions.error) return json({ error: redemptions.error.message }, 500);
    if (practices.error) return json({ error: practices.error.message }, 500);
    return json({ codes: codes.data, redemptions: redemptions.data, practices: practices.data });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'create_code') {
    const code = String(body.code ?? '').trim().toUpperCase().replace(/\s+/g, '-');
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) return json({ error: 'Code must be 4–40 letters/numbers/dashes' }, 400);
    const kind = body.kind === 'free' ? 'free' : 'percent';
    const percentOff = Number(body.percent_off ?? 0);
    if (kind === 'percent' && !(percentOff >= 1 && percentOff <= 100)) {
      return json({ error: 'percent_off must be 1–100 (use kind "free" for a 100% forever code)' }, 400);
    }
    const assignedEmail = body.assigned_email ? String(body.assigned_email).trim().toLowerCase() : null;
    const row = {
      code,
      kind,
      percent_off: kind === 'percent' ? percentOff : null,
      months: body.months ? Number(body.months) : null,
      assigned_email: assignedEmail,
      max_redemptions: body.max_redemptions ? Number(body.max_redemptions) : null,
      affiliate: body.affiliate ? String(body.affiliate).trim() : null,
      note: body.note ? String(body.note).trim() : null,
      created_by: userData?.user?.id ?? null,
    };
    const { data, error } = await admin.from('saas_codes').insert(row).select().single();
    if (error) return json({ error: error.message.includes('duplicate') ? 'That code already exists' : error.message }, 400);
    return json({ code: data as CodeRow });
  }

  if (body.action === 'toggle_code') {
    if (typeof body.id !== 'string' || typeof body.active !== 'boolean') return json({ error: 'id and active required' }, 400);
    const { error } = await admin.from('saas_codes').update({ active: body.active }).eq('id', body.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
