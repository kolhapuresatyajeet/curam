// Inbound HealthLink message filing — shared by the bridge ingest API and the
// manual report-upload path so both file messages identically. Callers must
// have already resolved the practice (agent key or staff JWT) and log the raw
// message to healthlink_messages for HIQA audit.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ORU^R01 lab result. Matches the patient by IHI number (falling back to
// name+DOB). Abnormal results are always stored with delivery_method 'call'
// (GP callback only — never AI delivery, per practice policy).
export async function handleOru(practiceId: string, msg: Record<string, any>) {
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
export async function handleAdt(practiceId: string, msg: Record<string, any>) {
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
export async function handleRef(practiceId: string, msg: Record<string, any>) {
  if (!msg.healthlink_ref) throw new Error('REF message missing healthlink_ref');
  const status = msg.appointment_date ? 'appointment_given' : 'acknowledged';
  const { error } = await admin
    .from('referrals')
    .update({ status, bridge_status: 'acked' })
    .eq('healthlink_ref', msg.healthlink_ref);
  if (error) throw new Error(`referrals update: ${error.message}`);

  await admin.from('inbox_messages').insert({
    practice_id: practiceId,
    channel: 'healthlink',
    from_name: msg.hospital ?? 'HealthLink',
    subject: 'Referral acknowledged',
    body: msg.note ?? `Referral ${msg.healthlink_ref}: ${status}.`,
    message_type: 'referral_ack',
  });
}

/** Dispatch a parsed message to the right filing handler. */
export async function fileMessage(practiceId: string, msg: Record<string, any>) {
  const type = String(msg.type ?? 'other').toUpperCase();
  if (type === 'ORU') await handleOru(practiceId, msg);
  else if (type === 'ADT') await handleAdt(practiceId, msg);
  else if (type === 'REF') await handleRef(practiceId, msg);
  // Other types: raw audit log only (caller logs it).
  return type;
}
