import { supabase, supabaseConfigured } from '@/lib/supabase';

/** Asks the sile-command Edge Function — Claude with live, RLS-scoped tools
 *  over the practice database (patients, labs, appointments, CDM). */
export async function askSileCommand(command: string): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  if (!supabaseConfigured || !supabase) return { ok: false, error: 'Síle needs the live (Supabase) deployment — demo mode has no AI.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Sign in first' };

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const response = await fetch(`${url}/functions/v1/sile-command`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body.error ?? `Síle command failed (HTTP ${response.status})` };
  return { ok: true, reply: body.reply ?? '' };
}
