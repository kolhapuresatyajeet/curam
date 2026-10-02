import { supabase, supabaseConfigured } from '@/lib/supabase';

export type SileChatMessage = { role: 'user' | 'assistant'; content: string };

export type SileChatResult =
  | { ok: true; reply: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; disabled?: boolean };

/** Sends the conversation to the sile-chat Edge Function (Claude Haiku, EU). */
export async function chatWithSile(
  messages: SileChatMessage[],
  context: { route: string },
): Promise<SileChatResult> {
  if (!supabaseConfigured || !supabase) {
    return { ok: false, error: 'Síle chat needs the live (Supabase) deployment — demo mode has no AI.' };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Sign in first' };

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const response = await fetch(`${url}/functions/v1/sile-chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.slice(-16), context }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: body.error ?? `Síle chat failed (HTTP ${response.status})`,
      disabled: response.status === 403,
    };
  }
  return {
    ok: true,
    reply: body.reply ?? '',
    inputTokens: body.inputTokens ?? 0,
    outputTokens: body.outputTokens ?? 0,
  };
}
