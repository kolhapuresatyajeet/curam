import { cors, json } from '../_shared/http.ts';

// HealthLink bridge ingest API. The desktop bridge agent (Electron, at the
// practice) authenticates with a per-agent key (x-bridge-key) issued here on
// first registration.
//
// Actions (POST JSON):
//   register  { practice_id, hostname, version }        -> { agent_id, agent_key }
//   heartbeat { agent_id }                              -> { ok, server_time }
//   ingest    { agent_id, messages: [...] }             -> { ok, stored }
//   outbox    { agent_id }                              -> { referrals: [...] }
//   ack       { agent_id, referral_id, healthlink_ref } -> { ok }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Registry of agents authenticated by agent_key -> { id, practice_id }.
const agentCache = new Map<string, { id: string; practice_id: string }>();

const BOOTSTRAP_KEY = Deno.env.get('BRIDGE_API_KEY') ?? '';

async function authenticateAgent(req: Request) {
  const agentKey = req.headers.get('x-bridge-key') ?? '';
  if (!agentKey) return null;
  // Bootstrap: the shared BRIDGE_API_KEY may only be used for `register`,
  // which provisions a per-agent key. Everything else requires the agent key.
  if (BOOTSTRAP_KEY && agentKey === BOOTSTRAP_KEY) {
    return { id: '', practice_id: '', bootstrap: true };
  }
  const cached = agentCache.get(agentKey);
  if (cached) return cached;
  const { data } = await admin
    .from('bridge_agents')
    .select('id, practice_id')
    .eq('agent_key', agentKey)
    .maybeSingle();
  if (!data) return null;
  agentCache.set(agentKey, { id: data.id, practice_id: data.practice_id });
  return { id: data.id, practice_id: data.practice_id };
}

async function touchAgent(agentId: string, status = 'online') {
  await admin
    .from('bridge_agents')
    .update({ status, last_seen_at: new Date().toISOString() })
    .eq('id', agentId);
}

// ---------- inbound message handlers ----------

// ORU^R01 lab result. Matches the patient by IHI number (falling back to
// name+DOB). Abnormal results are always stored with delivery_method 'call'
// (GP callback only — never AI delivery, per practice policy).
async function handleOru(practiceId: string, msg: Record<string, any>) {
  const { patient } = msg;
  let patientId = patient?.patient_id ?? null;

  if (!patientId && patient?.ihi) {
    const { data } = await admin
      .from('patients')
      .select('id')
      .eq('ihi_number', patient.ihi)
      .maybeSingle();
    patientId = data?.id ?? null;
  }
  if (!patientId && patient?.last_name && patient?.date_of_birth) {
    const { data } = await admin
      .from('patients')
      .select('id')
      .ilike('last_name', patient.last_name)
      .eq('date_of_birth', patient.date_of_birth)
      .maybeSingle();
    patientId = data?.id ?? null;
  }
  if (!patientId) throw new Error(`patient not matched: ${JSON.stringify(patient ?? {})}`);

  const abnormal: string[] = Array.isArray(msg.abnormal_flags) ? msg.abnormal_flags : [];
  const { error } = await admin.from('lab_results').insert({
    patient_id: patientId,
    source_hospital: msg.source_hospital ?? 'HealthLink',
    healthlink_message_id: msg.healthlink_message_id ?? null,
    results_json: msg.results ?? {},
    abnormal_flags: abnormal,
    delivery_method: abnormal.length > 0 ? 'call' : null,
  });
  if (error) throw new Error(`lab_results insert: ${error.message}`);

  await admin.from('inbox_messages').insert({
    practice_id: practiceId,
    channel: 'healthlink',
    from_name: msg.source_hospital ?? 'HealthLink',
    patient_id: patientId,
    subject: abnormal.length > 0
      ? `Abnormal lab result (${abnormal.join(', ')})`
      : 'Lab result received',
    body: msg.summary ?? 'Lab result received via HealthLink bridge.',
    message_type: 'lab_result',
    urgent: abnormal.length > 0,
  });
}

// ADT^A03/A08 discharge summary. Files to the inbox and links the patient.
async function handleAdt(practiceId: string, msg: Record<string, any>) {
  await admin.from('inbox_messages').insert({
    practice_id: practiceId,
    channel: 'healthlink',
    from_name: msg.source_hospital ?? 'HealthLink',
    patient_id: msg.patient?.patient_id ?? null,
    subject: `Discharge summary — ${msg.patient?.last_name ?? 'unknown patient'}`,
    body: [msg.diagnosis, msg.medications, msg.follow_up]
      .filter(Boolean)
      .join('\n\n') || 'Discharge summary received via HealthLink bridge.',
    message_type: 'discharge',
    urgent: Boolean(msg.urgent),
  });
}

// REF^I12 referral acknowledgement. Updates the referral's status.
async function handleRef(_practiceId: string, msg: Record<string, any>) {
  if (!msg.healthlink_ref) throw new Error('REF message missing healthlink_ref');
  const status = msg.appointment_date ? 'appointment_given' : 'acknowledged';
  const { error } = await admin
    .from('referrals')
    .update({ status, bridge_status: 'acked' })
    .eq('healthlink_ref', msg.healthlink_ref);
  if (error) throw new Error(`referrals update: ${error.message}`);

  await admin.from('inbox_messages').insert({
    practice_id: _practiceId,
    channel: 'healthlink',
    from_name: msg.hospital ?? 'HealthLink',
    subject: 'Referral acknowledged',
    body: msg.note ?? `Referral ${msg.healthlink_ref}: ${status}.`,
    message_type: 'referral_ack',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const agent = await authenticateAgent(req);
  if (!agent) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if ('bootstrap' in agent && agent.bootstrap) {
    // Bootstrap key: only register is allowed.
    if (body.action !== 'register') return json({ error: 'Bootstrap key may only register' }, 403);
  }

  try {
    switch (body.action) {
      case 'heartbeat': {
        await touchAgent(agent.id);
        return json({ ok: true, server_time: new Date().toISOString() });
      }

      case 'register': {
        const practiceId = body.practice_id;
        if (!practiceId) return json({ error: 'practice_id required' }, 400);
        const agentKey = randomKey();
        const { data: created, error: createErr } = await admin
          .from('bridge_agents')
          .insert({
            practice_id: practiceId,
            agent_key: agentKey,
            hostname: body.hostname ?? null,
            version: body.version ?? null,
            status: 'online',
            last_seen_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (createErr) return json({ error: createErr.message }, 500);
        return json({ ok: true, agent_id: created.id, agent_key: agentKey });
      }

      case 'ingest': {
        const messages: Array<Record<string, any>> = Array.isArray(body.messages) ? body.messages : [];
        let stored = 0;
        const errors: Array<{ healthlink_message_id?: string; error: string }> = [];

        for (const msg of messages) {
          const type = String(msg.type ?? 'other').toUpperCase();
          // Raw audit row first (HIQA: log every interaction).
          const { data: logged, error: logErr } = await admin
            .from('healthlink_messages')
            .insert({
              practice_id: agent.practice_id,
              direction: 'inbound',
              message_type: type,
              healthlink_message_id: msg.healthlink_message_id ?? null,
              status: 'received',
              bridge_agent_id: agent.id,
              raw_content: typeof msg.raw === 'string' ? msg.raw.slice(0, 100_000) : null,
            })
            .select('id')
            .single();
          if (logErr) {
            errors.push({ healthlink_message_id: msg.healthlink_message_id, error: logErr.message });
            continue;
          }

          try {
            if (type === 'ORU') await handleOru(agent.practice_id, msg);
            else if (type === 'ADT') await handleAdt(agent.practice_id, msg);
            else if (type === 'REF') await handleRef(agent.practice_id, msg);
            // Other types: raw log only.
            stored++;
            await admin
              .from('healthlink_messages')
              .update({ status: 'parsed' })
              .eq('id', logged!.id);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            errors.push({ healthlink_message_id: msg.healthlink_message_id, error: errMsg });
            await admin
              .from('healthlink_messages')
              .update({ status: 'error', error: errMsg })
              .eq('id', logged!.id);
          }
        }
        await touchAgent(agent.id, errors.length === stored ? 'online' : 'error');
        return json({ ok: true, stored, errors });
      }

      case 'outbox': {
        const { data, error } = await admin
          .from('referrals')
          .select('id, patient_id, specialty, hospital, bridge_payload, created_at, patients!inner(first_name, last_name, ihi_number, date_of_birth)')
          .eq('bridge_status', 'queued')
          .limit(10);
        if (error) return json({ error: error.message }, 500);
        await touchAgent(agent.id);
        return json({ ok: true, referrals: data });
      }

      case 'ack': {
        if (!body.referral_id) return json({ error: 'referral_id required' }, 400);
        const patch: Record<string, any> = {
          bridge_status: body.error ? 'error' : 'submitted',
          bridge_submitted_at: new Date().toISOString(),
        };
        if (body.healthlink_ref) patch.healthlink_ref = body.healthlink_ref;
        if (body.error) patch.bridge_error = body.error;
        const { error } = await admin
          .from('referrals')
          .update(patch)
          .eq('id', body.referral_id);
        if (error) return json({ error: error.message }, 500);
        // Audit row for the outbound submission.
        await admin.from('healthlink_messages').insert({
          practice_id: agent.practice_id,
          direction: 'outbound',
          message_type: 'REF',
          healthlink_message_id: body.healthlink_ref ?? null,
          status: body.error ? 'error' : 'submitted',
          error: body.error ?? null,
          bridge_agent_id: agent.id,
        });
        await touchAgent(agent.id);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
