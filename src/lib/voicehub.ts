import { supabase, supabaseConfigured } from '@/lib/supabase';

/** One-click VoiceHub AI receptionist provisioning. The shared provisioning
 *  secret lives only in the edge function — the browser just calls it. */

export interface VoicehubProvisionResult {
  tenant_id: string;
  agent_id: string;
  phone_number: string;
  phone_auto_provisioned: boolean;
  portal_url: string | null;
  portal_login?: { setup_url: string; emailed: boolean } | null;
  warning?: string;
}

export async function provisionVoicehub(): Promise<{ data?: VoicehubProvisionResult; error?: Error }> {
  if (!supabaseConfigured || !supabase) return { error: new Error('Needs the live (Supabase) deployment') };
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { error: new Error('Sign in first') };
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/voicehub-provision`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: new Error(json.error ?? `Provisioning failed (HTTP ${res.status})`) };
  return { data: json as VoicehubProvisionResult };
}
