import { cors, json } from '../_shared/http.ts';

// Platform support access ("login as"). The platform owner's own account
// carries a platform_admin flag in their Supabase user metadata (set via the
// admin API — never stored in any practice's staff table). Only those users
// can call this function.
//
//   GET  → every practice + its staff accounts (support console list)
//   POST { staffUserId } → a one-time magic-link token hash for that staff
//   account. The web console completes sign-in with supabase.auth.verifyOtp,
//   so the platform admin gets a normal RLS-scoped session AS that staff
//   member — no RLS bypass, no superuser claims. The target practice's
//   audit_log records support.impersonation_started (HIQA transparency).
//
// RLS is intentionally untouched: support sees exactly what the staff
// member sees, which is also what makes it useful for debugging.

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

async function requirePlatformAdmin(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin.auth.getUserById(userId);
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as { platform_admin?: boolean; email?: string };
  return meta.platform_admin === true ? { email: meta.email ?? data.user.email ?? '' } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'Sign in first' }, 401);

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

  const adminInfo = await requirePlatformAdmin(admin, userData.user.id);
  if (!adminInfo) return json({ error: 'Platform admin access required' }, 403);

  if (req.method === 'GET') {
    const [practicesRes, staffRes] = await Promise.all([
      admin.from('practices').select('id, name, address, created_at').order('created_at', { ascending: true }),
      admin.from('staff').select('id, practice_id, name, role, email, user_id, active').order('name'),
    ]);
    if (practicesRes.error) return json({ error: practicesRes.error.message }, 500);
    if (staffRes.error) return json({ error: staffRes.error.message }, 500);
    return json({ practices: practicesRes.data ?? [], staff: staffRes.data ?? [], adminEmail: adminInfo.email });
  }

  if (req.method === 'POST') {
    const { staffUserId } = await req.json().catch(() => ({}) as { staffUserId?: string });
    if (!staffUserId) return json({ error: 'staffUserId required' }, 400);

    const { data: staff, error: staffError } = await admin
      .from('staff')
      .select('id, name, role, email, practice_id, practices(name)')
      .eq('user_id', staffUserId)
      .limit(1)
      .maybeSingle();
    if (staffError) return json({ error: staffError.message }, 500);
    if (!staff) return json({ error: 'No staff account found for that user' }, 404);

    const { data: target, error: targetError } = await admin.auth.getUserById(staffUserId);
    if (targetError || !target.user?.email) {
      return json({ error: 'That staff member has no login account yet (invite pending).' }, 404);
    }

    // One-time magic-link token — the console redeems it with verifyOtp to
    // open a normal session for this staff account.
    const { data: link, error: linkError } = await admin.auth.generateLink({ type: 'magiclink', email: target.user.email });
    if (linkError || !link?.properties?.token_hash) {
      return json({ error: linkError?.message ?? 'Could not create support session' }, 500);
    }

    const practiceName = Array.isArray(staff.practices) ? (staff.practices[0] as { name?: string } | undefined)?.name : (staff.practices as { name?: string } | undefined)?.name;
    await admin.from('audit_log').insert({
      practice_id: staff.practice_id,
      user_id: staffUserId,
      action: 'support.impersonation_started',
      entity_type: 'staff',
      entity_id: staff.id,
      details_json: {
        platform_admin_email: adminInfo.email,
        staff_name: staff.name,
        staff_role: staff.role,
        practice_name: practiceName ?? staff.practice_id,
        note: 'Platform support signed in as this staff member (RLS-scoped session).',
      },
    });

    return json({
      tokenHash: link.properties.token_hash,
      staffName: staff.name,
      staffRole: staff.role,
      practiceName: practiceName ?? '',
      staffEmail: target.user.email,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
});
