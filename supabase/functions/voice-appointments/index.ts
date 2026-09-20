import { cors, json, requireVoiceKey } from '../_shared/http.ts';
import { matchPatientByMobile } from '../_shared/phone.ts';

const EMERGENCY = /chest pain|difficulty breathing|can't breathe|cannot breathe|shortness of breath|unconscious|stroke|severe bleeding/i;

function publicPatient(row: { id: string; practice_id: string; first_name: string; last_name: string; sile_consent: boolean }) {
  return {
    patientId: row.id,
    practiceId: row.practice_id,
    firstName: row.first_name,
    lastName: row.last_name,
    sileConsent: row.sile_consent,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const denied = requireVoiceKey(req);
  if (denied) return denied;

  const body = await req.json();
  const action = String(body.action ?? 'identify');
  const phone = String(body.phone ?? body.mobile ?? body.callerNumber ?? '');

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, service);

  if (action === 'register') {
    const { irishMobileNational } = await import('../_shared/phone.ts');
    const national = irishMobileNational(phone);
    if (!national) return json({ error: 'A valid Irish mobile number is required' }, 400);
    const firstName = String(body.firstName ?? body.patientFirstName ?? '').trim();
    const lastName = String(body.lastName ?? body.patientLastName ?? '').trim();
    const dob = String(body.dob ?? body.dateOfBirth ?? '');
    if (!firstName || !lastName || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return json({ error: 'firstName, lastName and dob (YYYY-MM-DD) are required' }, 400);
    }
    if (body.gdprConsent !== true && body.gdprConsent !== 'true') {
      return json({ error: 'Caller must confirm GDPR consent before registration' }, 400);
    }

    const existing = await matchPatientByMobile(admin, national);
    if (existing.patient) {
      return json({ error: 'A patient is already registered with this mobile number', patient: publicPatient(existing.patient) }, 409);
    }

    let practiceId = body.practiceId as string | undefined;
    if (!practiceId) {
      const { data: practices } = await admin.from('practices').select('id').limit(2);
      if (practices?.length === 1) practiceId = practices[0].id;
    }
    if (!practiceId) return json({ error: 'practiceId is required when more than one practice exists' }, 400);

    const storedPhone = `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
    const { data: created, error } = await admin
      .from('patients')
      .insert({
        practice_id: practiceId,
        first_name: firstName,
        last_name: lastName,
        dob,
        gender: body.gender ?? 'unknown',
        phone: storedPhone,
        email: body.email ?? '',
        address: body.address ?? '',
        eircode: body.eircode ?? '',
        gdpr_consent: true,
        sile_consent: body.sileConsent === false ? false : true,
      })
      .select('id, practice_id, first_name, last_name, sile_consent')
      .single();
    if (error || !created) return json({ error: error?.message ?? 'Could not register patient' }, 400);

    return json({ registered: true, patient: publicPatient(created) }, 201);
  }

  const matched = await matchPatientByMobile(admin, phone);
  if (!matched.patient) return json({ error: matched.error }, matched.status);
  const patient = matched.patient;

  if (action === 'identify') {
    return json({ patient: publicPatient(patient) });
  }

  if (action === 'list') {
    const { data: appointments, error } = await admin
      .from('appointments')
      .select('id, start_time, end_time, type, status, staff_id')
      .eq('patient_id', patient.id)
      .neq('status', 'cancelled')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(10);
    if (error) return json({ error: error.message }, 400);
    return json({
      patient: publicPatient(patient),
      appointments: appointments ?? [],
    });
  }

  if (action === 'cancel') {
    let appointmentId = body.appointmentId as string | undefined;
    if (!appointmentId) {
      const { data: upcoming } = await admin
        .from('appointments')
        .select('id')
        .eq('patient_id', patient.id)
        .in('status', ['scheduled', 'confirmed'])
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(2);
      if (!upcoming?.length) return json({ error: 'No upcoming appointment to cancel' }, 404);
      if (upcoming.length > 1) {
        return json({ error: 'Patient has more than one upcoming appointment. Pass appointmentId.' }, 409);
      }
      appointmentId = upcoming[0].id;
    }

    const { data: existing, error: findError } = await admin
      .from('appointments')
      .select('id, status, start_time, patient_id')
      .eq('id', appointmentId)
      .eq('patient_id', patient.id)
      .maybeSingle();
    if (findError) return json({ error: findError.message }, 400);
    if (!existing) return json({ error: 'Appointment not found for this mobile number' }, 404);
    if (!['scheduled', 'confirmed'].includes(existing.status ?? '')) {
      return json({ error: 'That appointment cannot be cancelled by voice' }, 409);
    }

    const { error: updateError } = await admin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', existing.id);
    if (updateError) return json({ error: updateError.message }, 400);

    const { syncAppointmentToGoogle } = await import('../_shared/google-calendar.ts');
    await syncAppointmentToGoogle(admin, existing.id);
    try {
      const { notifyAppointmentEmails } = await import('../_shared/booking-mail.ts');
      await notifyAppointmentEmails(admin, existing.id, 'cancelled');
    } catch {
      /* Patient email is independent of GP email */
    }

    await admin.from('sile_calls').insert({
      practice_id: patient.practice_id,
      patient_id: patient.id,
      direction: 'inbound',
      purpose: 'booking',
      transcript: String(body.reason ?? 'Cancelled by voice agent'),
      outcome: `Cancelled ${existing.id}`,
      duration_seconds: Number(body.callDurationSeconds ?? 0),
    });

    return json({ cancelled: true, appointmentId: existing.id, startTime: existing.start_time });
  }

  if (action !== 'book') return json({ error: 'action must be identify, list, book, cancel, or register' }, 400);

  if (!patient.sile_consent) {
    return json({ error: 'This patient has not consented to Síle. A receptionist must book.' }, 403);
  }

  const triage = String(body.triageNotes ?? body.reason ?? '');
  if (EMERGENCY.test(triage)) {
    return json({ emergency: 'Please hang up and call 999 or 112 now.' }, 409);
  }

  let staffId = body.staffId as string | undefined;
  if (!staffId) {
    const { data: gp } = await admin
      .from('staff')
      .select('id')
      .eq('practice_id', patient.practice_id)
      .eq('role', 'gp')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    staffId = gp?.id;
  }
  if (!staffId) return json({ error: 'No GP is configured for this practice' }, 400);

  const start = new Date(body.startTime);
  if (Number.isNaN(start.getTime())) return json({ error: 'Invalid startTime' }, 400);
  const duration = Number(body.durationMinutes ?? 20);
  const end = new Date(start.getTime() + duration * 60_000);

  const { data: clash } = await admin
    .from('appointments')
    .select('id')
    .eq('staff_id', staffId)
    .neq('status', 'cancelled')
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString())
    .limit(1);
  if (clash?.length) return json({ error: 'That slot is already booked' }, 409);

  const { data: appointment, error: insertError } = await admin
    .from('appointments')
    .insert({
      practice_id: patient.practice_id,
      patient_id: patient.id,
      staff_id: staffId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: body.type ?? 'routine',
      status: 'scheduled',
      booked_via: 'sile',
      sile_triage_notes: triage,
      reminder_sent: false,
    })
    .select('id, start_time, staff_id')
    .single();

  if (insertError || !appointment) return json({ error: insertError?.message ?? 'Could not book' }, 400);

  const { syncAppointmentToGoogle } = await import('../_shared/google-calendar.ts');
  await syncAppointmentToGoogle(admin, appointment.id);
  try {
    const { notifyAppointmentEmails } = await import('../_shared/booking-mail.ts');
    await notifyAppointmentEmails(admin, appointment.id, 'booked');
  } catch {
    /* Patient email is independent of GP email */
  }

  await admin.from('sile_calls').insert({
    practice_id: patient.practice_id,
    patient_id: patient.id,
    direction: 'inbound',
    purpose: 'booking',
    transcript: triage,
    outcome: `Booked ${appointment.id}`,
    duration_seconds: Number(body.callDurationSeconds ?? 0),
  });

  return json({
    appointmentId: appointment.id,
    startTime: appointment.start_time,
    staffId: appointment.staff_id,
    bookedVia: 'sile',
    patient: publicPatient(patient),
  });
});
