// Staff directory for voice-agent partners (VoiceHub "which doctor?" flow).
//
//   POST /functions/v1/staff-directory
//   x-booking-key: <master BOOKING_API_KEY or a per-clinic cbk_… key>
//   { "action": "staff", "practiceId": "pr_123" }   // practiceId optional with master key
//
// Response shape is deliberately tolerant (VoiceHub's CuramAdapter accepts any
// of: bare array, {staff:[…]}; per item: id|staffId and name|staffName) — we
// return the wrapped shape with duplicated keys so every variant matches.
//
// A per-clinic key is scoped to its own practice; the body practiceId cannot
// widen it. Only active clinical staff (GPs + nurses) are listed — patients'
// calls are only ever booked with them, matching appointment-availability.

import { cors, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, service);

  const body = await req.json().catch(() => ({}));
  const { resolveVoiceKey } = await import('../_shared/booking-keys.ts');
  const keyCheck = await resolveVoiceKey(
    admin,
    req.headers.get('x-booking-key') ?? '',
  );
  if (!keyCheck.ok) return json({ error: keyCheck.error }, keyCheck.status ?? 401);

  const practiceId = keyCheck.scopedPracticeId ?? (body.practiceId as string | undefined);
  if (!practiceId) return json({ error: 'practiceId is required' }, 400);

  let query = admin
    .from('staff')
    .select('id, name, role')
    .eq('practice_id', practiceId)
    .eq('active', true)
    .in('role', ['gp', 'nurse'])
    .order('role')
    .order('name');
  const { data: staff, error } = await query;
  if (error) return json({ error: error.message }, 400);

  const directory = (staff ?? []).map((member: { id: string; name: string; role: string }) => ({
    id: member.id,
    staffId: member.id,
    name: member.name,
    staffName: member.name,
    role: member.role,
  }));

  return json({ staff: directory });
});
