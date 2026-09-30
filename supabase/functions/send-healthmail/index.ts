import { cors, json } from '../_shared/http.ts';

// Sends a prescription (or approved repeat request) to the pharmacy via the
// prescriber's own Healthmail account. Requires JWT; GP-only content by design —
// the caller must be the prescriber or a GP/locum in the same practice.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if ((Deno.env.get('HEALTHMAIL_ENABLED') ?? 'false').toLowerCase() !== 'true') {
    return json({ error: 'Healthmail sending is not enabled for this practice yet' }, 503);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: caller } = await admin
    .from('staff')
    .select('id, practice_id, role, name, healthmail_address')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!caller) return json({ error: 'No staff record linked to this account' }, 403);
  if (!['gp', 'locum'].includes(caller.role ?? '')) {
    return json({ error: 'Only a GP can send prescriptions' }, 403);
  }

  const body = await req.json();
  const prescriptionId = body.prescriptionId ? String(body.prescriptionId) : null;
  const repeatRequestId = body.repeatRequestId ? String(body.repeatRequestId) : null;
  if (!prescriptionId && !repeatRequestId) return json({ error: 'prescriptionId or repeatRequestId required' }, 400);

  // Load prescription (either source), patient and pharmacy.
  let drugLines: { drug: string; dose: string; frequency: string; months: number }[] = [];
  let patientId = '';
  let prescriberId = caller.id;

  if (prescriptionId) {
    const { data: rx } = await admin
      .from('prescriptions')
      .select('id, patient_id, staff_id, drug_name, dose, frequency, duration_months, status')
      .eq('id', prescriptionId)
      .maybeSingle();
    if (!rx || rx.status === 'cancelled' || rx.status === 'expired') return json({ error: 'Prescription not found or not active' }, 404);
    patientId = rx.patient_id;
    prescriberId = rx.staff_id ?? caller.id;
    drugLines = [{ drug: rx.drug_name, dose: rx.dose ?? '', frequency: rx.frequency ?? '', months: rx.duration_months ?? 1 }];
  } else {
    const { data: repeat } = await admin
      .from('repeat_rx_requests')
      .select('id, patient_id, medicine, status, prescription_id, reviewed_by')
      .eq('id', repeatRequestId)
      .maybeSingle();
    if (!repeat) return json({ error: 'Repeat request not found' }, 404);
    if (repeat.status !== 'approved') return json({ error: 'Only approved repeat requests can be sent' }, 409);
    patientId = repeat.patient_id;
    drugLines = [{ drug: repeat.medicine, dose: '', frequency: 'as previous', months: 1 }];
    if (repeat.prescription_id) {
      const { data: linkedRx } = await admin
        .from('prescriptions')
        .select('drug_name, dose, frequency, duration_months, staff_id')
        .eq('id', repeat.prescription_id)
        .maybeSingle();
      if (linkedRx) {
        drugLines = [{ drug: linkedRx.drug_name, dose: linkedRx.dose ?? '', frequency: linkedRx.frequency ?? '', months: linkedRx.duration_months ?? 1 }];
        prescriberId = linkedRx.staff_id ?? caller.id;
      }
    }
  }

  const { data: patient } = await admin
    .from('patients')
    .select('first_name, last_name, dob, practice_id, pharmacy_healthmail')
    .eq('id', patientId)
    .maybeSingle();
  if (!patient || patient.practice_id !== caller.practice_id) return json({ error: 'Patient not found' }, 404);

  const pharmacy = String(patient.pharmacy_healthmail ?? '').trim().toLowerCase();
  if (!pharmacy.endsWith('@healthmail.ie')) {
    return json({ error: 'Patient has no nominated pharmacy Healthmail address. Add one to the patient record first.' }, 400);
  }

  // Prescriber's own Healthmail credentials — prescriptions must come from the prescriber.
  const { data: prescriber } = await admin
    .from('staff')
    .select('id, name, healthmail_address')
    .eq('id', prescriberId)
    .maybeSingle();
  if (!prescriber?.healthmail_address) return json({ error: 'The prescriber has not connected Healthmail in Settings' }, 503);

  const { data: ref } = await admin.from('staff_vault_refs').select('healthmail_secret_id').eq('staff_id', prescriber.id).maybeSingle();
  if (!ref?.healthmail_secret_id) return json({ error: 'Prescriber Healthmail password missing from the vault' }, 503);
  const { data: secretRow } = await admin
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', ref.healthmail_secret_id)
    .maybeSingle();
  if (!secretRow?.decrypted_secret) return json({ error: 'Could not read Healthmail credentials' }, 500);

  // Compose the prescription.
  const dob = patient.dob ? new Date(patient.dob).toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const rowsHtml = drugLines
    .map((line) => `<tr><td style="padding:4px 10px 4px 0"><b>${line.drug}</b></td><td style="padding:4px 10px 4px 0">${line.dose}</td><td style="padding:4px 10px 4px 0">${line.frequency}</td><td style="padding:4px 10px 4px 0">${line.months} month(s)</td></tr>`)
    .join('');
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
      <p><b>ELECTRONIC PRESCRIPTION</b></p>
      <p>Patient: <b>${patient.first_name} ${patient.last_name}</b><br/>DOB: ${dob}</p>
      <table style="border-collapse:collapse"><thead><tr><th align="left">Medication</th><th align="left">Dose</th><th align="left">Frequency</th><th align="left">Duration</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <p>Prescriber: <b>${prescriber.name}</b> (GP)<br/>Sent via Healthmail on ${new Date().toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      <p style="color:#6b7280;font-size:12px">This prescription was sent electronically under Irish ePrescribing legislation (S.I. 94 of 2020). Please contact the practice for any queries.</p>
    </div>`;

  const subject = `Prescription — ${patient.first_name} ${patient.last_name} (DOB ${dob})`;

  // SMTP via the prescriber's Healthmail account.
  const nodemailer = (await import('npm:nodemailer@6.9.16')).default;
  const transporter = nodemailer.createTransport({
    host: Deno.env.get('HEALTHMAIL_SMTP_HOST') ?? 'smtp.healthmail.ie',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: prescriber.healthmail_address, pass: secretRow.decrypted_secret },
  });
  try {
    await transporter.sendMail({
      from: prescriber.healthmail_address,
      to: pharmacy,
      subject,
      html,
      text: subject,
    });
  } catch (error) {
    return json({ error: `Healthmail send failed: ${error instanceof Error ? error.message : 'unknown'}` }, 502);
  }

  // Record the send.
  const now = new Date().toISOString();
  if (prescriptionId) {
    await admin.from('prescriptions').update({ healthmail_sent_at: now, pharmacy_healthmail: pharmacy }).eq('id', prescriptionId);
  } else {
    await admin.from('repeat_rx_requests').update({ status: 'sent', reviewed_at: now }).eq('id', repeatRequestId);
  }

  return json({ ok: true, to: pharmacy, sentAt: now });
});
