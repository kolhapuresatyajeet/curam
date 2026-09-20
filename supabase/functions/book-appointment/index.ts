const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-booking-key',
};

const EMERGENCY = /chest pain|difficulty breathing|can't breathe|cannot breathe|shortness of breath|unconscious|stroke|severe bleeding/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function bookingChannel(raw: unknown) {
  if (raw === 'sile' || raw === 'voice' || raw === 'voice_agent') return 'sile';
  if (raw === 'reception') return 'reception';
  return 'online';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const bookingKey = Deno.env.get('BOOKING_API_KEY') ?? '';
  const provided = req.headers.get('x-booking-key') ?? '';
  const body = await req.json();
  const bookedVia = bookingChannel(body.bookedVia);

  if (bookedVia === 'reception') {
    return json({ error: 'Reception bookings use the practice diary, not this API' }, 403);
  }

  if (bookedVia === 'sile') {
    if (!bookingKey) return json({ error: 'Voice booking is not configured' }, 503);
    if (provided !== bookingKey) return json({ error: 'Voice agent key required' }, 401);
  }

  const triage = String(body.triageNotes ?? body.reason ?? '');
  if (EMERGENCY.test(triage)) {
    return json({ emergency: 'Please hang up and call 999 or 112 now.' }, 409);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, service);

  let patientId = body.patientId as string | undefined;
  let practiceId = body.practiceId as string | undefined;

  if (!patientId) {
    const phone = String(body.phone ?? body.mobile ?? '');
    if (phone) {
      const { matchPatientByMobile } = await import('../_shared/phone.ts');
      const matched = await matchPatientByMobile(admin, phone);
      if (!matched.patient) return json({ error: matched.error }, matched.status);
      patientId = matched.patient.id;
      practiceId = matched.patient.practice_id;
      if (bookedVia === 'sile' && !matched.patient.sile_consent) {
        return json({ error: 'This patient has not consented to Síle. A receptionist must book.' }, 403);
      }
    } else {
      const first = String(body.patientFirstName ?? body.firstName ?? '').trim();
      const last = String(body.patientLastName ?? body.lastName ?? '').trim();
      const dob = String(body.dob ?? body.dateOfBirth ?? '');
      if (!first || !last || !dob) return json({ error: 'Patient name and date of birth are required' }, 400);
      const { data: matches, error } = await admin
        .from('patients')
        .select('id, practice_id, first_name, last_name, dob, sile_consent')
        .ilike('first_name', first)
        .ilike('last_name', last)
        .eq('dob', dob);
      if (error) return json({ error: error.message }, 400);
      if (!matches?.length) return json({ error: 'Patient not found. Register with the practice first.' }, 404);
      if (matches.length > 1) return json({ error: 'More than one matching patient. A receptionist must book.' }, 409);
      patientId = matches[0].id;
      practiceId = matches[0].practice_id;
      if (bookedVia === 'sile' && !matches[0].sile_consent) {
        return json({ error: 'This patient has not consented to Síle. A receptionist must book.' }, 403);
      }
    }
  }

  if (!practiceId) {
    const { data: patient } = await admin
      .from('patients')
      .select('practice_id, sile_consent')
      .eq('id', patientId)
      .single();
    practiceId = patient?.practice_id;
    if (bookedVia === 'sile' && patient && !patient.sile_consent) {
      return json({ error: 'This patient has not consented to Síle. A receptionist must book.' }, 403);
    }
  }
  if (!practiceId || !patientId) return json({ error: 'Practice not found' }, 400);

  let staffId = body.staffId as string | undefined;
  if (!staffId) {
    const { data: gp } = await admin
      .from('staff')
      .select('id')
      .eq('practice_id', practiceId)
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
      practice_id: practiceId,
      patient_id: patientId,
      staff_id: staffId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: body.type ?? 'routine',
      status: 'scheduled',
      booked_via: bookedVia,
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
    /* Patient/GP email must never fail the booking */
  }

  if (bookedVia === 'sile') {
    await admin.from('sile_calls').insert({
      practice_id: practiceId,
      patient_id: patientId,
      direction: 'inbound',
      purpose: 'booking',
      transcript: triage,
      outcome: `Booked ${appointment.id}`,
      duration_seconds: Number(body.callDurationSeconds ?? 0),
    });
  }

  return json({
    appointmentId: appointment.id,
    startTime: appointment.start_time,
    staffId: appointment.staff_id,
    bookedVia,
  });
});
