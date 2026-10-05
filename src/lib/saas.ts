import { supabase, supabaseConfigured } from '@/lib/supabase';

/** Cúram's own SaaS billing (GP pays for the software) — distinct from Stripe
 *  Connect, which is practices taking patient payments. Billing state lives on
 *  the practice row (saas_status / saas_plan / saas_period_end). */

export type SaasStatus = 'none' | 'trial' | 'active' | 'past_due' | 'free' | 'canceled';
export type SaasPlan = 'monthly' | 'yearly' | 'free';

export interface SaasBilling {
  saasStatus: SaasStatus;
  saasPlan: SaasPlan | null;
  saasPeriodEnd: string | null;
}

export interface SaasCode {
  id: string;
  code: string;
  kind: 'percent' | 'free';
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

export interface SaasPracticeBilling {
  id: string;
  name: string;
  saas_status: SaasStatus;
  saas_plan: SaasPlan | null;
  saas_period_end: string | null;
}

export interface SaasRedemption {
  id: string;
  code: string;
  practice_id: string;
  email: string | null;
  plan: string | null;
  created_at: string;
}

async function saasPost<T>(fn: string, body?: unknown): Promise<T> {
  if (!supabaseConfigured || !supabase) throw new Error('Needs the live (Supabase) deployment');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
  return json as T;
}

export async function fetchSaasBilling(practiceId: string): Promise<SaasBilling> {
  if (!supabaseConfigured || !supabase) return { saasStatus: 'trial', saasPlan: null, saasPeriodEnd: null }; // demo mode — billing off
  const { data } = await supabase
    .from('practices')
    .select('saas_status, saas_plan, saas_period_end')
    .eq('id', practiceId)
    .maybeSingle();
  return {
    saasStatus: (data?.saas_status as SaasStatus) ?? 'none',
    saasPlan: (data?.saas_plan as SaasPlan) ?? null,
    saasPeriodEnd: (data?.saas_period_end as string) ?? null,
  };
}

export function startCheckout(plan: 'monthly' | 'yearly', code?: string): Promise<{ url?: string; free?: boolean }> {
  return saasPost<{ url?: string; free?: boolean }>('saas-checkout', { plan, code });
}

export function openBillingPortal(): Promise<{ url: string }> {
  return saasPost<{ url: string }>('saas-portal');
}

// ── Super-admin console API ─────────────────────────────────────────────────

export function saasAdminList(): Promise<{ codes: SaasCode[]; redemptions: SaasRedemption[]; practices: SaasPracticeBilling[] }> {
  if (!supabaseConfigured || !supabase) return Promise.reject(new Error('Needs the live deployment'));
  return supabase.auth.getSession().then(async ({ data }) => {
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in first');
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/saas-admin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Failed (HTTP ${res.status})`);
    return json;
  });
}

export function saasAdminCreateCode(input: {
  code: string;
  kind: 'percent' | 'free';
  percent_off?: number;
  months?: number;
  assigned_email?: string;
  max_redemptions?: number;
  affiliate?: string;
  note?: string;
}): Promise<{ code: SaasCode }> {
  return saasPost<{ code: SaasCode }>('saas-admin', { action: 'create_code', ...input });
}

export function saasAdminToggleCode(id: string, active: boolean): Promise<{ ok: true }> {
  return saasPost<{ ok: true }>('saas-admin', { action: 'toggle_code', id, active });
}
