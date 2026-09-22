export const HEALTHMAIL_SMTP_HOST = 'smtp.healthmail.ie';
export const HEALTHMAIL_IMAP_HOST = 'imap.healthmail.ie';

export function formatPrescriptionEmail(input: {
  practiceName: string;
  gpName: string;
  patientName: string;
  dob: string;
  drugName: string;
  dose: string;
  frequency: string;
  durationMonths: number;
}): { subject: string; body: string } {
  return {
    subject: `ePrescription — ${input.patientName}`,
    body: [
      `Practice: ${input.practiceName}`,
      `Prescriber: ${input.gpName}`,
      `Patient: ${input.patientName} (DOB ${input.dob})`,
      '',
      `${input.drugName} ${input.dose} ${input.frequency} for ${input.durationMonths} month(s)`,
      '',
      'Sent securely via Healthmail. GP approval recorded in the audit trail.',
    ].join('\n'),
  };
}
