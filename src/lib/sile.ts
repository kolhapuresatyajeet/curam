const EMERGENCY = /chest pain|difficulty breathing|can't breathe|cannot breathe|shortness of breath|unconscious|stroke|severe bleeding/i;

export function detectEmergency(text: string): boolean {
  return EMERGENCY.test(text);
}

export function emergencyScript(): string {
  return 'Please hang up and call 999 or 112 now.';
}

export function canSileDeliverResult(abnormal: boolean): boolean {
  return !abnormal;
}

export function irishEnglishResultScript(patientFirstName: string, resultSummary: string): string {
  return `Hello ${patientFirstName}, this is Síle calling from your GP practice. Your recent results are back and your doctor has marked them as normal. ${resultSummary} If you have any concerns, you can call the practice.`;
}

/** Contract for the separate voice-agent project. Auth: `x-booking-key` only — never the service role. */
export function sileVoiceTools(supabaseUrl: string) {
  const voice = `${supabaseUrl}/functions/v1/voice-appointments`;
  const slots = `${supabaseUrl}/functions/v1/appointment-availability`;
  return [
    {
      name: 'register_patient',
      description:
        'Create a patient when identify returns 404. Collect first name, surname, date of birth, and explicit GDPR consent. Uses the caller’s mobile number.',
      url: voice,
      method: 'POST',
      body: {
        action: 'register',
        phone: '+353872213344',
        firstName: 'Mary',
        lastName: "O'Brien",
        dob: '1964-03-14',
        gdprConsent: true,
        practiceId: 'optional if only one practice',
      },
    },
    {
      name: 'identify_patient',
      description: 'Resolve the caller from the PSTN / Twilio mobile number (E.164 or 08X).',
      url: voice,
      method: 'POST',
      body: { action: 'identify', phone: '+353872213344' },
    },
    {
      name: 'list_appointments',
      description: 'Upcoming appointments for that mobile number.',
      url: voice,
      method: 'POST',
      body: { action: 'list', phone: '+353872213344' },
    },
    {
      name: 'get_availability',
      description: 'Free 20-minute slots in Europe/Dublin. Pass practiceId from identify.',
      url: slots,
      method: 'GET',
    },
    {
      name: 'book_appointment',
      description:
        'Book from the caller’s mobile. If they describe chest pain, breathing difficulty, unconsciousness, stroke, or severe bleeding, do not call this — tell them to hang up and dial 999 or 112.',
      url: voice,
      method: 'POST',
      body: {
        action: 'book',
        phone: '+353872213344',
        startTime: 'ISO-8601 from get_availability',
        staffId: 'optional',
        type: 'routine | urgent | cdm | nurse | phone',
        triageNotes: 'caller reason',
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel a future scheduled/confirmed appointment for this mobile. Pass appointmentId if they have more than one.',
      url: voice,
      method: 'POST',
      body: { action: 'cancel', phone: '+353872213344', appointmentId: 'optional uuid' },
    },
  ];
}
