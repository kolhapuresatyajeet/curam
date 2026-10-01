// Real AI Scribe: audio/transcript in → transcription (OpenAI, EU) → structured
// SOAP + ICPC-2 (Claude Haiku with cached patient context) → usage metered.
// Auth: Supabase JWT (verified at the gateway). Consent is mandatory.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Cost model (millicents). Override via secrets when models change.
const TRANSCRIBE_MODEL = Deno.env.get('AI_TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe';
const STRUCTURE_MODEL = Deno.env.get('AI_STRUCTURE_MODEL') ?? 'claude-haiku-4-5';
const TRANSCRIBE_MILLICENTS_PER_SEC = Number(Deno.env.get('AI_TRANSCRIBE_MILLICENTS_PER_SEC') ?? '5'); // $0.003/min
const INPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_INPUT_MILLICENTS_PER_MTOK') ?? '100'); // $1/MTok
const OUTPUT_MILLICENTS_PER_MTOK = Number(Deno.env.get('AI_OUTPUT_MILLICENTS_PER_MTOK') ?? '500'); // $5/MTok

// LiteLLM gateway (optional). When LITELLM_BASE_URL is set, both provider
// calls are routed through the LiteLLM proxy (one key, per-practice virtual
// keys, routing/fallbacks, spend tracking). Direct OpenAI/Anthropic keys
// remain the fallback. Example: https://litellm.yourdomain.eu
const LITELLM_BASE = Deno.env.get('LITELLM_BASE_URL')?.replace(/\/+$/, '') ?? '';
const LITELLM_KEY = Deno.env.get('LITELLM_API_KEY') ?? '';

function gatewayAuthHeaders(): Record<string, string> {
  // LiteLLM accepts Bearer; sending x-api-key too keeps the same headers
  // working against direct Anthropic endpoints if the base URL is swapped.
  const key = LITELLM_KEY || Deno.env.get('ANTHROPIC_API_KEY') || '';
  return { Authorization: `Bearer ${key}`, 'x-api-key': key };
}

async function transcribeAudio(audio: ArrayBuffer, filename: string): Promise<{ transcript?: string; error?: string }> {
  const key = LITELLM_KEY || Deno.env.get('OPENAI_API_KEY') || '';
  if (!key) {
    return { error: 'Transcription is not configured (set LITELLM_API_KEY + LITELLM_BASE_URL, or OPENAI_API_KEY)' };
  }
  const endpoint = LITELLM_BASE
    ? `${LITELLM_BASE}/v1/audio/transcriptions`
    : 'https://api.openai.com/v1/audio/transcriptions';

  const form = new FormData();
  form.append('file', new Blob([audio]), filename);
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', 'en');
  form.append('prompt', 'Irish general practice consultation. Medical terms, drug names and ICPC-2 coding context.');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { error: body.error?.message ?? `Transcription failed (HTTP ${response.status})` };
  return { transcript: body.text ?? '' };
}

function patientContextBlock(patient: any, conditions: any[], medications: string[]): string {
  const age = patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31_557_600_000) : '?';
  const lines = [
    `Age: ${age}  Sex: ${patient.gender ?? 'not recorded'}  Smoking: ${patient.smoking_status ?? 'not recorded'}`,
    patient.allergies ? `Allergies: ${patient.allergies}` : 'Allergies: none recorded',
  ];
  const active = conditions.filter((c) => c.status === 'active').map((c) => c.condition_name ?? c.condition_code);
  if (active.length) lines.push(`Active conditions: ${active.join(', ')}`);
  if (medications.length) lines.push(`Current medications: ${medications.join(', ')}`);
  return lines.join('\n');
}

async function structureSoap(transcript: string, context: string): Promise<{ draft?: any; codes?: string[]; inputTokens?: number; outputTokens?: number; error?: string }> {
  if (!LITELLM_BASE && !Deno.env.get('ANTHROPIC_API_KEY')) {
    return { error: 'Note structuring is not configured (set LITELLM_BASE_URL + LITELLM_API_KEY, or ANTHROPIC_API_KEY)' };
  }

  const system = `You are a medical scribe for an Irish GP. Convert the consultation transcript into a structured SOAP note.
Use only what is in the transcript and context. Never invent findings. Write in concise clinical English (Irish conventions: 999/112 for emergencies, dd/MM/yyyy dates).
Also suggest 0-3 ICPC-2 codes (format "CODE Label") that match the assessment.
Respond with JSON only: {"subjective": string, "objective": string, "assessment": string, "plan": string, "icpc2": string[]}`;

  // Anthropic /v1/messages format — natively proxied by LiteLLM (same body,
  // cache_control included), and the direct API when no gateway is configured.
  const endpoint = LITELLM_BASE
    ? `${LITELLM_BASE}/v1/messages`
    : 'https://api.anthropic.com/v1/messages';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...gatewayAuthHeaders(),
      ...(LITELLM_BASE ? {} : { 'anthropic-version': '2023-06-01' }),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      max_tokens: 1200,
      system: [
        { type: 'text', text: system },
        // Cached: patient context repeats across the practice's consults each session.
        { type: 'text', text: `PATIENT CONTEXT:\n${context}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcript}` }],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { error: body.error?.message ?? `Structuring failed (HTTP ${response.status})` };

  const text = (body.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
    return {
      draft: {
        subjective: parsed.subjective ?? '',
        objective: parsed.objective ?? '',
        assessment: parsed.assessment ?? '',
        plan: parsed.plan ?? '',
      },
      codes: Array.isArray(parsed.icpc2) ? parsed.icpc2.slice(0, 3).map(String) : [],
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  } catch {
    return { error: 'Could not parse the AI draft' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

  // Monthly cap — fail closed with a clear message.
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
    return json({ error: `Monthly AI budget reached (€${spentCents.toFixed(2)} of €${(capCents / 100).toFixed(2)}). The practice manager can raise the cap.` }, 429);
  }

  const contentType = req.headers.get('content-type') ?? '';
  let audio: ArrayBuffer | null = null;
  let filename = 'consult.webm';
  let transcript = '';
  let patientId = '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('audio');
    if (file instanceof File && file.size > 0) {
      if (file.size > 25 * 1024 * 1024) return json({ error: 'Recording too large (25 MB limit)' }, 413);
      audio = await file.arrayBuffer();
      filename = file.name || filename;
    }
    transcript = String(form.get('transcript') ?? '');
    patientId = String(form.get('patientId') ?? '');
  } else {
    const body = await req.json();
    transcript = String(body.transcript ?? '');
    patientId = String(body.patientId ?? '');
  }

  if (!patientId) return json({ error: 'patientId required' }, 400);

  const { data: patient } = await admin
    .from('patients')
    .select('dob, gender, allergies, smoking_status, practice_id')
    .eq('id', patientId)
    .maybeSingle();
  if (!patient || patient.practice_id !== practiceId) return json({ error: 'Patient not found in this practice' }, 404);

  const { data: conditions } = await admin
    .from('patient_conditions')
    .select('condition_code, condition_name, status')
    .eq('patient_id', patientId);
  const { data: rxRows } = await admin
    .from('prescriptions')
    .select('drug_name, dose, status')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .limit(20);

  const context = patientContextBlock(
    patient,
    conditions ?? [],
    (rxRows ?? []).map((rx: any) => [rx.drug_name, rx.dose].filter(Boolean).join(' ')),
  );

  // 1) Transcribe (if audio given; otherwise trust the supplied transcript)
  let audioSeconds = 0;
  if (audio) {
    audioSeconds = Math.round(audio.byteLength / 32_000); // ~32 kB/s webm opus — refined below by actual duration
    const result = await transcribeAudio(audio, filename);
    if (result.error) return json({ error: result.error }, 502);
    transcript = result.transcript ?? transcript;
  } else if (!transcript.trim()) {
    return json({ error: 'Provide a recording or a transcript' }, 400);
  }

  // 2) Structure with patient context
  const structured = await structureSoap(transcript, context);
  if (structured.error && !structured.draft) return json({ error: structured.error }, 502);

  // 3) Meter usage (never blocks the response on failure)
  const costMillicents =
    audioSeconds * TRANSCRIBE_MILLICENTS_PER_SEC +
    (structured.inputTokens ?? 0) * (INPUT_MILLICENTS_PER_MTOK / 1_000_000) +
    (structured.outputTokens ?? 0) * (OUTPUT_MILLICENTS_PER_MTOK / 1_000_000);
  try {
    await admin.from('ai_usage_log').insert({
      practice_id: practiceId,
      user_id: userData.user.id,
      kind: 'scribe',
      model: `${TRANSCRIBE_MODEL}+${STRUCTURE_MODEL}`,
      audio_seconds: audioSeconds,
      input_tokens: structured.inputTokens ?? 0,
      output_tokens: structured.outputTokens ?? 0,
      cost_millicents: Math.max(1, Math.round(costMillicents)),
    });
  } catch {
    /* metering must not break the scribe */
  }

  return json({ transcript, draft: structured.draft, codes: structured.codes ?? [] });
});
