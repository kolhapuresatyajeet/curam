// Síle chat: the GP's read-only AI assistant. Conversational Q&A over live
// practice data — never mutates records. Feature-flagged for cost control:
// set the SILE_CHAT_ENABLED secret to 'true'/'false' (takes effect without
// redeploy). Usage is metered to ai_usage_log and shares the monthly AI cap.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const CHAT_MODEL = Deno.env.get('AI_CHAT_MODEL') ?? 'claude-haiku-4-5';
const INPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_INPUT_MILLICENTS_PER_MTOK') ?? '100'); // $1/MTok
const OUTPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_OUTPUT_MILLICENTS_PER_MTOK') ?? '500'); // $5/MTOK

// Same optional LiteLLM gateway as ai-scribe (one key, per-practice virtual keys).
const LITELLM_BASE = (Deno.env.get('LITELLM_BASE_URL') ?? '').replace(/\/+$/, '').replace(/\/v1$/, '');
const LITELLM_KEY = Deno.env.get('LITELLM_API_KEY') ?? '';

function gatewayAuthHeaders(): Record<string, string> {
  const key = LITELLM_KEY || Deno.env.get('ANTHROPIC_API_KEY') || '';
  return { Authorization: `Bearer ${key}`, 'x-api-key': key };
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

async function runChat(messages: ChatMessage[], context: string): Promise<{ error?: string; reply?: string; inputTokens?: number; outputTokens?: number }> {
  if (!LITELLM_BASE && !Deno.env.get('ANTHROPIC_API_KEY')) {
    return { error: 'Chat is not configured (set LITELLM_BASE_URL + LITELLM_API_KEY, or ANTHROPIC_API_KEY)' };
  }
  const system = `You are Síle, the AI assistant inside Cúram, a GP practice management platform for Irish general practice.
You assist the practice team (GPs, nurses, receptionists, managers). You are READ-ONLY: you can answer questions and suggest actions, but you cannot change any record — always tell the user to make the change themselves in the UI when action is needed.
Rules:
- Concise, warm, professional. Plain clinical English with Irish conventions (dates dd/MM/yyyy, EUR currency, emergencies 999/112).
- If the user describes an emergency (chest pain, breathing difficulty, stroke signs), tell them to call 999/112 immediately.
- Never invent patient data. If something isn't in the context, say so.
- You are not a diagnostician for the patient — support the clinician, don't replace their judgement.
- Never output full patient charts; summarise.`;

  const endpoint = LITELLM_BASE ? `${LITELLM_BASE}/v1/messages` : 'https://api.anthropic.com/v1/messages';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...gatewayAuthHeaders(),
      ...(LITELLM_BASE ? {} : { 'anthropic-version': '2023-06-01' }),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 700,
      system: [
        { type: 'text', text: system },
        // Cached: the practice context block repeats across turns.
        { type: 'text', text: `PRACTICE CONTEXT (live snapshot):\n${context}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { error: body.error?.message ?? `Chat failed (HTTP ${response.status})` };
  const reply = (body.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  return { reply, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Cost flag — hard gate, read at runtime so toggling needs no redeploy.
  if (Deno.env.get('SILE_CHAT_ENABLED') !== 'true') {
    return json({ error: 'Chat with Síle is currently disabled by the practice.' }, 403);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const { data: staff } = await admin.from('staff').select('id, practice_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  const practiceId = staff?.practice_id;
  if (!practiceId) return json({ error: 'No practice linked to this account' }, 403);

  const { messages: rawMessages, context } = await req.json().catch(() => ({ messages: [], context: {} }));
  const messages: ChatMessage[] = Array.isArray(rawMessages)
    ? rawMessages
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
        .slice(-16)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4_000) }))
    : [];
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Send the conversation history ending with a user message' }, 400);
  }

  // Live practice snapshot for context (cheap counts only — no patient charts).
  const today = new Date().toISOString().slice(0, 10);
  const [appointments, unreviewedLabs, drafts, practice] = await Promise.all([
    admin.from('appointments').select('id', { count: 'exact', head: true }).eq('practice_id', practiceId).gte('start_time', `${today}T00:00:00`).lt('start_time', `${today}T23:59:59`),
    admin.from('lab_results').select('abnormal_flags').eq('practice_id', practiceId).eq('gp_reviewed', false).limit(100),
    admin.from('referrals').select('id', { count: 'exact', head: true }).eq('practice_id', practiceId).eq('status', 'draft').eq('sile_drafted', true),
    admin.from('practices').select('name').eq('id', practiceId).maybeSingle(),
  ]);
  const abnormalCount = (unreviewedLabs.data ?? []).filter((row: any) => Array.isArray(row.abnormal_flags) && row.abnormal_flags.length > 0).length;
  const route = String(context?.route ?? '/');
  const contextBlock = [
    `Practice: ${practice?.data?.name ?? 'GP practice'} (Supabase EU)`,
    `Today: ${new Date().toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`,
    `Appointments today: ${appointments.count ?? 'unknown'}`,
    `Lab results awaiting GP review (some abnormal): ${abnormalCount}`,
    `Síle referral drafts awaiting approval: ${drafts.count ?? 0}`,
    `The user is currently viewing: ${route}`,
  ].join('\n');

  const result = await runChat(messages, contextBlock);
  if ('error' in result && result.error && !result.reply) return json({ error: result.error }, 502);

  // Meter usage (shares the practice's monthly AI cap with the scribe).
  const costMillicents =
    (result.inputTokens ?? 0) * (INPUT_MILLICENTS_PER_MTOK / 1_000_000) +
    (result.outputTokens ?? 0) * (OUTPUT_MILLICENTS_PER_MTOK / 1_000_000);
  try {
    await admin.from('ai_usage_log').insert({
      practice_id: practiceId,
      user_id: userData.user.id,
      kind: 'chat',
      model: CHAT_MODEL,
      input_tokens: result.inputTokens ?? 0,
      output_tokens: result.outputTokens ?? 0,
      cost_millicents: Math.max(1, Math.round(costMillicents)),
    });
  } catch {
    /* metering must not break the chat */
  }

  return json({ reply: result.reply ?? '', inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0 });
});
