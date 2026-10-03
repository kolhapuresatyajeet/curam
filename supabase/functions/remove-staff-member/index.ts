import { cors, json } from '../_shared/http.ts';
import { withMonitoring } from '../_shared/monitoring.ts';

// Remove a staff member from the practice (GP/PM only).
//
//  - active = false, user_id = null: their Google account is no longer
//    linked to this practice and cannot re-claim the row (claim_staff_slot
//    only claims active rows — migration 030).
//  - Their data access ends immediately: every RLS policy resolves the
//    practice via their staff row, which no longer exists, so every query
//    returns nothing even if a browser session token is still unexpired
//    (Supabase access JWTs cannot be revoked; they expire within the hour
//    and only ever see empty data).
//  - Their clinical record is untouched: signed notes stay signed (HIQA).
//  - Written to audit_log; the removed member can join another practice
//    via a fresh invite with the same email.

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(withMonitoring(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'Sign in first' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

  const { data: caller } = await admin
    .from('staff')
    .select('id, practice_id, role, name')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!caller) return json({ error: 'No practice linked to this account' }, 403);
  if (caller.role !== 'gp' && caller.role !== 'pm') {
    return json({ error: 'Only the GP or practice manager can remove staff.' }, 403);
  }

  const { staffId } = await req.json().catch(() => ({}) as { staffId?: string });
  if (!staffId) return json({ error: 'staffId required' }, 400);

  const { data: target, error: targetError } = await admin
    .from('staff')
    .select('id, name, role, email, user_id, active')
    .eq('id', staffId)
    .eq('practice_id', caller.practice_id)
    .maybeSingle();
  if (targetError) return json({ error: targetError.message }, 500);
  if (!target) return json({ error: 'Staff member not found in this practice' }, 404);
  if (target.id === caller.id) return json({ error: 'You cannot remove yourself.' }, 400);
  if (caller.role === 'pm' && target.role === 'gp') {
    return json({ error: 'A practice manager cannot remove a GP.' }, 403);
  }
  if (target.active === false && !target.user_id) {
    return json({ error: 'This member is already removed.' }, 409);
  }

  const revokedUserId: string | null = target.user_id ?? null;
  const { error: updateError } = await admin
    .from('staff')
    .update({ active: false, user_id: null })
    .eq('id', target.id);
  if (updateError) return json({ error: updateError.message }, 500);

  await admin.from('audit_log').insert({
    practice_id: caller.practice_id,
    user_id: userData.user.id,
    action: 'staff.removed',
    entity_type: 'staff',
    entity_id: target.id,
    details_json: {
      removed_name: target.name,
      removed_role: target.role,
      removed_email: target.email,
      removed_by: caller.name,
      login_revoked: Boolean(revokedUserId),
      note: 'Access revoked; clinical record retained. Member may rejoin via a new invite.',
    },
  });

  return json({ ok: true, name: target.name });
}, 'remove-staff-member'));
