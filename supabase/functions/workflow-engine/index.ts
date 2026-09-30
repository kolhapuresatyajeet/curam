import { cors, json } from '../_shared/http.ts';

// Workflow engine (cron): drains workflow_events queued by DB triggers, runs
// time-based scans (unpaid invoices, CDM recalls), evaluates active definitions
// and executes their action chains. Every run is logged to workflow_runs; an
// action failure is logged and the chain continues.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const TEMPLATES: Record<string, (ctx: any) => { subject?: string; text: string }> = {
  dna: (ctx) => ({
    text: `Hi ${ctx.firstName}, we missed you at your appointment today. Please call the practice to rebook. Cúram`,
  }),
  confirmation: (ctx) => ({
    text: `Hi ${ctx.firstName}, your appointment at the practice is confirmed. Cúram`,
  }),
  lab_result: (ctx) => ({
    subject: `Lab result received — ${ctx.patientName}`,
    text: `A lab result from ${ctx.source} has arrived for ${ctx.patientName}. Please review and record delivery method. (Abnormal flags: ${ctx.flags})`,
  }),
  invoice_reminder: (ctx) => ({
    subject: `Outstanding balance — €${ctx.balance}`,
    text: `Hello ${ctx.firstName}, your practice has an outstanding balance of €${ctx.balance} for ${ctx.description}. Please call or pay in-room at your next visit.`,
  }),
  invoice_unpaid: (ctx) => ({
    subject: `Invoice unpaid 7 days — ${ctx.patientName}`,
    text: `${ctx.patientName}: invoice of €${ctx.balance} is unpaid for 7+ days (${ctx.description}).`,
  }),
  cdm_recall: (ctx) => ({
    subject: `CDM review due — ${ctx.patientName}`,
    text: `${ctx.patientName}: ${ctx.condition} review is due (${ctx.dueDate}). Contact the patient to schedule the nurse + GP review.`,
  }),
};

async function sendGenericSms(admin: any, patientId: string, text: string) {
  const { irishMobileE164 } = await import('../_shared/sms.ts');
  const messagingEnabled = (Deno.env.get('SMS_ENABLED') ?? 'false').toLowerCase() === 'true';
  if (!messagingEnabled) return { ok: false, skipped: true };
  const { data: patient } = await admin.from('patients').select('phone').eq('id', patientId).maybeSingle();
  const to = patient?.phone ? irishMobileE164(String(patient.phone)) : null;
  if (!to) return { ok: false, error: 'no valid mobile' };

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const from = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
  if (!sid || !token || !from) return { ok: false, skipped: true };

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
  });
  await admin.from('sms_log').insert({ patient_id: patientId, direction: 'outbound', message: text, status: response.ok ? 'sent' : 'failed' });
  return { ok: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
}

async function sendGenericEmail(admin: any, patientId: string, subject: string, text: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('RESEND_FROM') ?? 'Cúram <beth.t@example.com>';
  const { data: patient } = await admin.from('patients').select('email, first_name').eq('id', patientId).maybeSingle();
  if (!apiKey || !patient?.email?.includes('@')) return { ok: false, skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [patient.email], subject, text }),
  });
  return { ok: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` };
}

async function addInboxTask(admin: any, practiceId: string, patientId: string | null, subject: string, text: string) {
  const { error } = await admin.from('inbox_messages').insert({
    practice_id: practiceId,
    channel: 'internal',
    from_name: 'Cúram workflows',
    from_address: 'internal',
    patient_id: patientId,
    subject,
    body: text,
    message_type: 'internal',
    read: false,
    urgent: true,
    received_at: new Date().toISOString(),
  });
  return { ok: !error, error: error?.message };
}

async function executeAction(admin: any, definition: any, action: any, event: any, ctx: any) {
  const templates = TEMPLATES[action.template] ?? TEMPLATES[action.template];
  const t = templates(ctx);
  switch (action.type) {
    case 'sms':
      return sendGenericSms(admin, event.patient_id, t.text);
    case 'email':
      return sendGenericEmail(admin, event.patient_id, t.subject ?? 'Cúram', t.text);
    case 'inbox_task':
      return addInboxTask(admin, definition.practice_id, event.patient_id, t.subject ?? definition.name, t.text);
    default:
      return { ok: false, error: `unknown action type ${action.type}` };
  }
}

async function runDefinition(admin: any, definition: any, event: { event_type: string; entity_id: string | null; patient_id: string | null; payload: any }, ctx: any) {
  const actions = Array.isArray(definition.actions_json) ? definition.actions_json : [];
  const executed: unknown[] = [];
  for (const action of actions) {
    try {
      const result = await executeAction(admin, definition, action, event, ctx);
      executed.push({ action: action.type, ok: Boolean(result?.ok), ...(result?.error ? { error: result.error } : {}) });
    } catch (error) {
      // Error handling: log and continue the chain.
      executed.push({ action: action.type, ok: false, error: error instanceof Error ? error.message : 'action failed' });
    }
  }
  await admin.from('workflow_runs').insert({
    practice_id: definition.practice_id,
    workflow_id: definition.id,
    patient_id: event.patient_id,
    trigger_data: { event_type: event.event_type, entity_id: event.entity_id },
    actions_executed: executed,
    result: executed.every((e: any) => e.ok) ? 'ok' : 'partial',
    ran_at: new Date().toISOString(),
  });
  await admin.rpc('increment_workflow_run_count', { p_workflow_id: definition.id }).catch?.(() => undefined);
}

async function drainEvents(admin: any) {
  const { data: events } = await admin
    .from('workflow_events')
    .select('id, practice_id, event_type, entity_type, entity_id, patient_id, payload')
    .order('created_at', { ascending: true })
    .limit(100);
  const processed: string[] = [];
  for (const event of events ?? []) {
    const { data: definitions } = await admin
      .from('workflow_definitions')
      .select('id, practice_id, name, actions_json')
      .eq('practice_id', event.practice_id)
      .eq('trigger_event', event.event_type)
      .eq('active', true);
    for (const definition of definitions ?? []) {
      const ctx = await buildContext(admin, event);
      await runDefinition(admin, definition, event, ctx);
    }
    processed.push(event.id);
  }
  if (processed.length) {
    await admin.from('workflow_events').delete().in('id', processed);
  }
  return processed.length;
}

async function buildContext(admin: any, event: any) {
  if (!event.patient_id) return {};
  const { data: patient } = await admin
    .from('patients')
    .select('first_name, last_name')
    .eq('id', event.patient_id)
    .maybeSingle();
  return {
    firstName: patient?.first_name ?? '',
    patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
    ...(event.payload ?? {}),
  };
}

async function scanInvoices(admin: any) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: unpaid } = await admin
    .from('invoices')
    .select('id, practice_id, patient_id, amount, paid_amount, description, issued_at')
    .in('status', ['unbilled', 'invoiced', 'partial'])
    .lt('issued_at', sevenDaysAgo)
    .limit(50);
  for (const invoice of unpaid ?? []) {
    const ctx = {
      balance: (Number(invoice.amount) - Number(invoice.paid_amount)).toFixed(2),
      description: invoice.description ?? 'appointment fee',
    };
    // Idempotency: skip if this invoice already triggered this workflow.
    const { data: prior } = await admin
      .from('workflow_runs')
      .select('id')
      .contains('trigger_data', { invoice_id: invoice.id })
      .limit(1);
    if (prior?.length) continue;

    const { data: definitions } = await admin
      .from('workflow_definitions')
      .select('id, practice_id, name, actions_json')
      .eq('trigger_event', 'invoice_unpaid_7d')
      .eq('active', true)
      .eq('practice_id', invoice.practice_id);
    for (const definition of definitions ?? []) {
      await runDefinition(admin, definition, { event_type: 'invoice_unpaid_7d', entity_id: invoice.id, patient_id: invoice.patient_id, payload: { invoice_id: invoice.id } }, ctx);
    }
  }
}

async function scanCdm(admin: any) {
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const { data: due } = await admin
    .from('cdm_enrolments')
    .select('id, patient_id, condition, next_review_date, patients!inner(practice_id, first_name, last_name)')
    .eq('status', 'active')
    .not('next_review_date', 'is', null)
    .lt('next_review_date', dueDate)
    .limit(50);
  for (const enrolment of due ?? []) {
    const { data: prior } = await admin
      .from('workflow_runs')
      .select('id')
      .contains('trigger_data', { enrolment_id: enrolment.id })
      .limit(1);
    if (prior?.length) continue;

    const patient = Array.isArray(enrolment.patients) ? enrolment.patients[0] : enrolment.patients;
    const ctx = {
      patientName: `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'Patient',
      condition: enrolment.condition ?? 'CDM',
      dueDate: enrolment.next_review_date,
    };
    const { data: definitions } = await admin
      .from('workflow_definitions')
      .select('id, practice_id, name, actions_json')
      .eq('trigger_event', 'cdm_review_due')
      .eq('active', true)
      .eq('practice_id', patient.practice_id);
    for (const definition of definitions ?? []) {
      await runDefinition(admin, definition, { event_type: 'cdm_review_due', entity_id: enrolment.id, patient_id: enrolment.patient_id, payload: { enrolment_id: enrolment.id } }, ctx);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const cronKey = Deno.env.get('CRON_SECRET') ?? '';
  if (!cronKey) return json({ error: 'CRON_SECRET not configured' }, 503);
  if ((req.headers.get('x-cron-key') ?? '') !== cronKey) return json({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const eventsProcessed = await drainEvents(admin);
  await scanInvoices(admin);
  await scanCdm(admin);

  return json({ ok: true, eventsProcessed });
});
