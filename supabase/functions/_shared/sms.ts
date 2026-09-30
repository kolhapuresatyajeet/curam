type Admin = any;

/**
 * Feature flag: SMS/WhatsApp messaging is off unless SMS_ENABLED=true.
 * When off, every send is a clean no-op (nothing is logged or marked sent),
 * so enabling it later picks up naturally.
 */
export function messagingEnabled() {
  return (Deno.env.get('SMS_ENABLED') ?? 'false').toLowerCase() === 'true';
}

/**
 * Delivery channel: 'sms' (default) or 'whatsapp'.
 * WhatsApp requires a Twilio WhatsApp-enabled sender (Meta business verification).
 */
function channelPrefix() {
  return (Deno.env.get('TWILIO_CHANNEL') ?? 'sms').toLowerCase() === 'whatsapp' ? 'whatsapp:' : '';
}

/** Normalise Irish mobile to E.164 (+3538XXXXXXXX) for Twilio. */
export function irishMobileE164(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('353')) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith('8')) return `+353${digits}`;
  return null;
}

function dublinStamp(iso: string) {
  return new Date(iso).toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function sendTwilio(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const from = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
  if (!sid || !token || !from) return { ok: false, skipped: true, error: 'Twilio not configured' };

  const prefix = channelPrefix();
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: `${prefix}${to}`, From: `${prefix}${from}`, Body: body }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, skipped: false, error: json.message ?? `HTTP ${response.status}`, sid: json.sid };
  }
  return { ok: true, skipped: false, sid: json.sid as string | undefined };
}

async function logSms(admin: Admin, patientId: string | null, message: string, status: string) {
  await admin.from('sms_log').insert({ patient_id: patientId, direction: 'outbound', message, status });
}

/** Appointment confirmation / cancellation SMS to the patient's mobile. Never throws. */
export async function notifyAppointmentSms(admin: Admin, appointmentId: string, kind: 'booked' | 'cancelled') {
  try {
    if (!messagingEnabled()) return { ok: false, skipped: true, error: 'SMS feature disabled' };

    const { data: apt } = await admin
      .from('appointments')
      .select('id, start_time, patients(id, first_name, phone), staff(name)')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!apt) return { ok: false, error: 'appointment missing' };

    const patient = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
    const staff = Array.isArray(apt.staff) ? apt.staff[0] : apt.staff;
    const to = patient?.phone ? irishMobileE164(String(patient.phone)) : null;
    if (!to) return { ok: false, error: 'no valid mobile' };

    const when = dublinStamp(apt.start_time);
    const text =
      kind === 'booked'
        ? `Hi ${patient?.first_name ?? ''}, your appointment with ${staff?.name ?? 'the practice'} is confirmed for ${when}. Reply or call the practice to change it. Cúram`
        : `Hi ${patient?.first_name ?? ''}, your appointment on ${when} has been cancelled. Call the practice to rebook. Cúram`;

    const result = await sendTwilio(to, text);
    await logSms(admin, patient?.id ?? null, text, result.ok ? 'sent' : 'failed');
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'sms failed' };
  }
}

export type ReminderKind = '48h' | '2h';

/** Reminder SMS for the cron function. Returns how many were sent. */
export async function sendReminders(admin: Admin, kind: ReminderKind) {
  // Flag off → do nothing at all, so enabling SMS later still reminds future appointments.
  if (!messagingEnabled()) return { sent: 0, failed: 0, skipped: true, found: 0 };

  const column = kind === '48h' ? 'reminder_48h_sent' : 'reminder_2h_sent';
  const now = Date.now();
  const hours = kind === '48h' ? 48 : 2;
  // Everything starting within the next `hours` hours that has not had this reminder yet.
  const until = new Date(now + hours * 3_600_000).toISOString();

  const { data: due, error } = await admin
    .from('appointments')
    .select('id, start_time, type, patient_id, reminder_48h_sent, reminder_2h_sent, patients(id, first_name, phone), staff(name)')
    .neq('status', 'cancelled')
    .gt('start_time', new Date(now).toISOString())
    .lt('start_time', until)
    .eq(column, false)
    .limit(50);

  if (error) return { sent: 0, failed: 0, error: error.message };

  let sent = 0;
  let failed = 0;
  for (const apt of due ?? []) {
    const patient = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
    const staff = Array.isArray(apt.staff) ? apt.staff[0] : apt.staff;
    const to = patient?.phone ? irishMobileE164(String(patient.phone)) : null;
    if (!to) {
      // Mark as sent so we don't retry appointments that can never receive SMS.
      await admin.from('appointments').update({ [column]: true }).eq('id', apt.id);
      continue;
    }
    const when = dublinStamp(apt.start_time);
    const prefix = kind === '48h' ? 'Reminder:' : 'Starting soon:';
    const text = `${prefix} ${patient?.first_name ?? ''}, your appointment with ${staff?.name ?? 'the practice'} is at ${when} (${apt.type ?? 'routine'}). Cúram`;

    const result = await sendTwilio(to, text);
    await logSms(admin, patient?.id ?? null, text, result.ok ? 'sent' : 'failed');
    if (result.ok) {
      sent += 1;
      await admin.from('appointments').update({ [column]: true }).eq('id', apt.id);
    } else if (result.skipped) {
      // Twilio misconfigured at runtime — leave flag unset so it can be retried.
      return { sent, failed, error: result.error, found: due?.length ?? 0 };
    } else {
      failed += 1;
    }
  }
  return { sent, failed, found: due?.length ?? 0 };
}
