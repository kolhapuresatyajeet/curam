// Síle command brain — natural-language questions answered against the LIVE
// practice database via tool-calling (Claude Haiku through the LiteLLM
// gateway). Phase 2 of the Síle voice assistant.
//
// Auth & data access: the caller's Supabase JWT is attached to the Supabase
// client used by every tool, so Row-Level Security scopes every answer to the
// caller's practice — the model can never see cross-practice data because the
// database itself won't return it.
//
// Every query is audited (audit_log) and metered (ai_usage_log, monthly cap).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const STRUCTURE_MODEL = Deno.env.get('AI_STRUCTURE_MODEL') ?? 'claude-haiku-4-5';
const INPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_INPUT_MILLICENTS_PER_MTOK') ?? '100');
const OUTPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_OUTPUT_MILLICENTS_PER_MTOK') ?? '500');

const LITELLM_BASE = (Deno.env.get('LITELLM_BASE_URL') ?? '').replace(/\/+$/, '').replace(/\/v1$/, '');
const LITELLM_KEY = Deno.env.get('LITELLM_API_KEY') ?? '';

function gatewayAuthHeaders(): Record<string, string> {
  const key = LITELLM_KEY || Deno.env.get('ANTHROPIC_API_KEY') || '';
  return { Authorization: `Bearer ${key}`, 'x-api-key': key };
}

// ── Tool definitions (Anthropic tool-use format) ────────────────────────────

const TOOLS = [
  {
    name: 'search_patients',
    description: 'Find patients in this practice by name (first or last, partial match). Returns id, name, dob.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Patient name or part of a name' } },
      required: ['query'],
    },
  },
  {
    name: 'get_patient_overview',
    description: 'Full brief for one patient: active conditions, current medications, allergies, unreviewed lab count, last signed consultation summary.',
    input_schema: {
      type: 'object',
      properties: { patient_id: { type: 'string', description: 'Patient UUID from search_patients' } },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_patient_labs',
    description: 'Lab results for one patient, newest first, with abnormal flags and GP-review status.',
    input_schema: {
      type: 'object',
      properties: { patient_id: { type: 'string' } },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_last_consultation',
    description: 'The most recent signed consultation for one patient: date, assessment, plan.',
    input_schema: {
      type: 'object',
      properties: { patient_id: { type: 'string' } },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_waiting_room',
    description: 'Patients currently checked in and waiting, with wait minutes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_today_appointments',
    description: "Today's appointments with patient names, times and statuses.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_unreviewed_labs',
    description: 'All lab results awaiting GP review in this practice, with abnormal flags highlighted.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_cdm_reviews_due',
    description: 'Chronic Disease Management reviews awaiting GP sign-off, with patient names.',
    input_schema: { type: 'object', properties: {} },
  },
];

const SYSTEM = `You are Síle, the AI assistant inside Cúram, an Irish GP practice management platform. You are speaking with a GP (or practice staff member).

Answer in ONE to THREE short sentences — every reply is read aloud by voice, so be brief and natural. Use plain clinical English with Irish conventions (dd/MM/yyyy dates, 999/112 for emergencies).

Use the tools to check real data before answering anything about patients, labs, appointments or the waiting room. Never invent patient data — if a tool returns nothing, say so.

Compliance rules you must follow:
- Abnormal lab results are GP-callback only. Describe them as "held for your review" — never read out alarming result values in detail; the patient may be nearby.
- Never give medical advice or diagnoses. If asked, explain that's the GP's call and offer to open the record.
- Prescriptions are never auto-approved.

Final answers must be plain text (no markdown) unless the GP asked for a list.`;

type ToolCall = { id: string; name: string; input: Record<string, string> };

async function runTool(
  db: ReturnType<any> /* Supabase client with user JWT — RLS-scoped */,
  name: string,
  input: Record<string, string>,
): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);

  switch (name) {
    case 'search_patients': {
      const q = (input.query ?? '').trim();
      if (!q) return [];
      let { data } = await db
        .from('patients')
        .select('id, first_name, last_name, dob, medical_card_type')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(5);
      // Spoken names usually arrive as "Grace Kelly" — no patient has that as
      // a single column value. Fall back to per-word tokens.
      if (!data?.length && q.includes(' ')) {
        const tokens = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/^%|%$/g, ''));
        const orFilter = tokens.map((t) => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`).join(',');
        if (orFilter) {
          ({ data } = await db
            .from('patients')
            .select('id, first_name, last_name, dob, medical_card_type')
            .or(orFilter)
            .limit(5));
        }
      }
      return data ?? [];
    }
    case 'get_patient_overview': {
      const pid = input.patient_id;
      const [{ data: patient }, { data: conditions }, { data: meds }, { data: labs }, { data: consults }] =
        await Promise.all([
          db.from('patients').select('id, first_name, last_name, dob, gender, allergies, smoking_status').eq('id', pid).maybeSingle(),
          db.from('patient_conditions').select('condition_name, condition_code, status').eq('patient_id', pid),
          db.from('prescriptions').select('drug_name, dose, frequency, status').eq('patient_id', pid).eq('status', 'active').limit(15),
          db.from('lab_results').select('id, abnormal_flags, gp_reviewed, received_at').eq('patient_id', pid).order('received_at', { ascending: false }).limit(10),
          db.from('consultations').select('created_at, assessment, plan, status').eq('patient_id', pid).order('created_at', { ascending: false }).limit(3),
        ]);
      if (!patient) return { error: 'Patient not found in this practice' };
      return {
        patient,
        conditions: conditions ?? [],
        medications: meds ?? [],
        recent_labs: labs ?? [],
        recent_consultations: consults ?? [],
      };
    }
    case 'get_patient_labs': {
      const { data } = await db
        .from('lab_results')
        .select('source_hospital, results_json, abnormal_flags, gp_reviewed, delivery_method, received_at, preview')
        .eq('patient_id', input.patient_id)
        .order('received_at', { ascending: false })
        .limit(10);
      return data ?? [];
    }
    case 'get_last_consultation': {
      const { data } = await db
        .from('consultations')
        .select('created_at, subjective, assessment, plan, status, icpc2_codes')
        .eq('patient_id', input.patient_id)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? { note: 'No consultations recorded' };
    }
    case 'get_waiting_room': {
      const { data } = await db
        .from('waiting_room')
        .select('arrived_at, called_in_at, completed_at, appointments(patient_id, patients(first_name, last_name))')
        .order('arrived_at', { ascending: false })
        .limit(20);
      return (data ?? []).filter((w: any) => !w.called_in_at && !w.completed_at);
    }
    case 'get_today_appointments': {
      const { data } = await db
        .from('appointments')
        .select('start_time, end_time, status, type, patients(first_name, last_name)')
        .gte('start_time', `${today}T00:00:00Z`)
        .lte('start_time', `${today}T23:59:59Z`)
        .order('start_time')
        .limit(40);
      return data ?? [];
    }
    case 'get_unreviewed_labs': {
      const { data } = await db
        .from('lab_results')
        .select('patient_id, patients(first_name, last_name), abnormal_flags, gp_reviewed, received_at, preview')
        .eq('gp_reviewed', false)
        .order('received_at', { ascending: false })
        .limit(20);
      return data ?? [];
    }
    case 'get_cdm_reviews_due': {
      const { data } = await db
        .from('cdm_reviews')
        .select('id, patient_id, patients(first_name, last_name), review_type, nurse_signed, gp_signed, completed_at')
        .eq('gp_signed', false)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(20);
      return data ?? [];
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function callModel(messages: unknown[], tools: unknown[]): Promise<{ content: any[]; stop: string; inputTokens: number; outputTokens: number } | { error: string }> {
  const endpoint = LITELLM_BASE ? `${LITELLM_BASE}/v1/messages` : 'https://api.anthropic.com/v1/messages';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...gatewayAuthHeaders(),
      ...(LITELLM_BASE ? {} : { 'anthropic-version': '2023-06-01' }),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: STRUCTURE_MODEL, max_tokens: 800, system: SYSTEM, tools, messages }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { error: body.error?.message ?? `Model call failed (HTTP ${response.status})` };
  return {
    content: body.content ?? [],
    stop: body.stop_reason ?? '',
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

  // Every tool query runs through this client — RLS scopes it to the caller.
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin.from('staff').select('id, practice_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  const practiceId = staff?.practice_id;
  if (!practiceId) return json({ error: 'No practice linked to this account' }, 403);

  // Monthly AI cap — fail closed, same policy as the scribe.
  const capCents = Number(Deno.env.get('AI_MONTHLY_CAP_CENTS') ?? '500');
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usageRows } = await admin
    .from('ai_usage_log')
    .select('cost_millicents')
    .eq('practice_id', practiceId)
    .gt('created_at', monthStart.toISOString());
  const spentCents = (usageRows ?? []).reduce((sum: number, row: any) => sum + (row.cost_millicents ?? 0), 0) / 1000;
  if (spentCents >= capCents) {
    return json({ error: `Monthly AI budget reached (€${spentCents.toFixed(2)}). The practice manager can raise the cap.` }, 429);
  }

  const { command } = await req.json().catch(() => ({ command: '' }));
  if (!command?.trim()) return json({ error: 'command required' }, 400);

  // Tool-use loop (max 4 rounds).
  const messages: any[] = [{ role: 'user', content: `GP says: "${command.trim()}"` }];
  let finalText = '';
  let totalIn = 0;
  let totalOut = 0;

  for (let round = 0; round < 4; round++) {
    const result = await callModel(messages, TOOLS);
    if ('error' in result) return json({ error: result.error }, 502);
    totalIn += result.inputTokens;
    totalOut += result.outputTokens;

    if (result.stop !== 'tool_use') {
      finalText = result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ').trim();
      break;
    }

    messages.push({ role: 'assistant', content: result.content });
    const toolResults = [];
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue;
      const output = await runTool(userClient, block.name, block.input ?? {});
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  if (!finalText) finalText = "I couldn't work out an answer to that — try rephrasing, or ask me about a patient, labs, or today's schedule.";

  // Audit (HIQA) + meter usage — never block the reply on failure.
  try {
    await admin.from('audit_log').insert({
      practice_id: practiceId,
      user_id: userData.user.id,
      action: 'sile_command',
      entity_type: 'ai_query',
      entity_id: crypto.randomUUID(),
      details_json: { command: command.trim() },
    });
  } catch {
    /* audit best-effort */
  }
  try {
    const costMillicents = totalIn * (INPUT_MILLICENTS_PER_MTOK / 1_000_000) + totalOut * (OUTPUT_MILLICENTS_PER_MTOK / 1_000_000);
    await admin.from('ai_usage_log').insert({
      practice_id: practiceId,
      user_id: userData.user.id,
      kind: 'sile-command',
      model: STRUCTURE_MODEL,
      audio_seconds: 0,
      input_tokens: totalIn,
      output_tokens: totalOut,
      cost_millicents: Math.max(1, Math.round(costMillicents)),
    });
  } catch {
    /* metering best-effort */
  }

  return json({ reply: finalText, inputTokens: totalIn, outputTokens: totalOut });
});
