import { getSupabaseConfig, supabase } from '@/lib/supabase';

// Platform support access. The signed-in platform admin can open a normal
// RLS-scoped session AS a staff member of any practice (impersonation).
// Every start is audit-logged by the Edge Function into that practice's
// audit_log, and an amber "Support session" banner is shown the whole time.

export interface SupportStaff {
  id: string;
  practice_id: string;
  name: string;
  role: string;
  email: string | null;
  user_id: string | null;
  active: boolean | null;
}

export interface SupportPractice {
  id: string;
  name: string;
  address: string | null;
  created_at: string | null;
}

export interface SupportSessionInfo {
  staffName: string;
  staffRole: string;
  practiceName: string;
  staffEmail: string;
}

const BANNER_KEY = 'curam-support-session';

export function supportSessionInfo(): SupportSessionInfo | null {
  try {
    const raw = localStorage.getItem(BANNER_KEY);
    return raw ? (JSON.parse(raw) as SupportSessionInfo) : null;
  } catch {
    return null;
  }
}

export function clearSupportSession() {
  localStorage.removeItem(BANNER_KEY);
}

export async function isPlatformAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.platform_admin === true;
}

export async function listSupportTargets(): Promise<{ practices: SupportPractice[]; staff: SupportStaff[]; adminEmail: string }> {
  const config = getSupabaseConfig();
  const session = await supabase!.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Sign in first');
  const res = await fetch(`${config.url}/functions/v1/support-impersonate`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Failed (HTTP ${res.status})`);
  return body;
}

export async function impersonate(staffUserId: string): Promise<SupportSessionInfo> {
  const config = getSupabaseConfig();
  const session = await supabase!.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Sign in first');

  const res = await fetch(`${config.url}/functions/v1/support-impersonate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffUserId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Failed (HTTP ${res.status})`);

  // Redeem the one-time token — this replaces the admin's session with the
  // target staff member's normal RLS-scoped session.
  const { error } = await supabase!.auth.verifyOtp({ type: 'magiclink', token_hash: body.tokenHash });
  if (error) throw new Error(error.message);

  const info: SupportSessionInfo = {
    staffName: body.staffName,
    staffRole: body.staffRole,
    practiceName: body.practiceName,
    staffEmail: body.staffEmail,
  };
  localStorage.setItem(BANNER_KEY, JSON.stringify(info));
  return info;
}
