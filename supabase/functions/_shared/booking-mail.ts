type Admin = any;

function dublinStamp(iso: string) {
  return new Date(iso).toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function sendResend(to: string, subject: string, text: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('RESEND_FROM') ?? 'Cúram <beth.t@example.com>';
  if (!apiKey || !to.includes('@')) return { ok: false, skipped: true, error: 'not configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, skipped: false, error: body.message ?? body.error?.message ?? `HTTP ${response.status}` };
  }
  return { ok: true, skipped: false };
}

export async function notifyAppointmentEmails(admin: Admin, appointmentId: string, kind: 'booked' | 'cancelled') {
  const { data: apt } = await admin
    .from('appointments')
    .select('id, start_time, end_time, type, patients(first_name, last_name, email), staff(name, email)')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!apt) return { patient: { ok: false, error: 'appointment missing' }, gp: { ok: false, error: 'appointment missing' } };

  const patient = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
  const staff = Array.isArray(apt.staff) ? apt.staff[0] : apt.staff;
  const when = `${dublinStamp(apt.start_time)} – ${dublinStamp(apt.end_time)}`;
  const verb = kind === 'booked' ? 'booked' : 'cancelled';
  const patientName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'Patient';

  const patientText =
    kind === 'booked'
      ? `Hello ${patient?.first_name ?? ''},\n\nYour GP appointment is ${verb} for ${when} with ${staff?.name ?? 'your GP'} (${apt.type ?? 'routine'}).\n\nIf you need to change this, call the practice or the voice line.\n\nCúram`
      : `Hello ${patient?.first_name ?? ''},\n\nYour GP appointment on ${when} has been cancelled.\n\nCúram`;

  const gpText = `${patientName}: appointment ${verb} for ${when} (${apt.type ?? 'routine'}).`;

  let patientResult = { ok: false as boolean, error: 'no patient email' };
  try {
    if (patient?.email) {
      patientResult = await sendResend(
        String(patient.email),
        kind === 'booked' ? 'Your GP appointment is confirmed' : 'Your GP appointment was cancelled',
        patientText,
      );
    }
  } catch (error) {
    patientResult = { ok: false, error: error instanceof Error ? error.message : 'patient email failed' };
  }

  let gpResult = { ok: false as boolean, error: 'no GP email' };
  try {
    if (staff?.email) {
      gpResult = await sendResend(String(staff.email), `Cúram: appointment ${verb} — ${patientName}`, gpText);
    }
  } catch (error) {
    gpResult = { ok: false, error: error instanceof Error ? error.message : 'GP email failed' };
  }

  return { patient: patientResult, gp: gpResult };
}
