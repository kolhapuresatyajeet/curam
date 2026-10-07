import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  CdmEnrolment,
  CdmReview,
  Gender,
  HouseholdRelationship,
  Invoice,
  InvoiceStatus,
  MedicalCardType,
  Patient,
  Role,
  SmokingStatus,
  Staff,
  Tone,
  WaitingRoomEntry,
} from '@/types/domain';

export interface PracticeRow {
  id: string;
  name: string;
  address: string | null;
  eircode: string | null;
  phone: string | null;
  healthlink_id: string | null;
  healthmail: string | null;
  pcrs_reg: string | null;
  stripe_account_id: string | null;
  opening_hours: string | null;
  voicehub_agent_id: string | null;
  voicehub_tenant_id: string | null;
  voicehub_phone: string | null;
  voicehub_portal_email: string | null;
  voicehub_connected_at: string | null;
  onboarding_done: string[] | null;
}

export interface StaffRow {
  id: string;
  practice_id: string;
  user_id: string | null;
  name: string;
  role: Role;
  email: string | null;
  phone: string | null;
  sessions: string | null;
  permissions: string[] | null;
  active: boolean | null;
  google_email?: string | null;
  google_calendar_id?: string | null;
  google_calendar_summary?: string | null;
  healthmail_address?: string | null;
}

export interface PatientRow {
  id: string;
  practice_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string | null;
  pps_number: string | null;
  gms_number: string | null;
  ihi_number: string | null;
  medical_card_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  eircode: string | null;
  pharmacy_name: string | null;
  pharmacy_healthmail: string | null;
  allergies: string | null;
  smoking_status: string | null;
  gdpr_consent: boolean | null;
  sile_consent: boolean | null;
  household_id?: string | null;
  is_primary?: boolean | null;
  relationship?: string | null;
  chronic_conditions?: string[] | null;
  created_at: string;
}

const tones: Tone[] = ['teal', 'blue', 'amber', 'purple', 'coral'];

export function staffFromRow(row: StaffRow): Staff {
  return {
    id: row.id,
    practiceId: row.practice_id,
    name: row.name,
    role: row.role,
    email: row.email ?? '',
    phone: row.phone ?? '',
    sessions: row.sessions ?? '',
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [row.role],
    initials: row.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    title: row.role,
    colour: 'teal',
    active: row.active !== false,
    googleEmail: row.google_email ?? undefined,
    googleCalendarId: row.google_calendar_id ?? undefined,
    googleCalendarSummary: row.google_calendar_summary ?? undefined,
    healthmailAddress: row.healthmail_address ?? undefined,
    invited: !row.user_id,
  };
}

export function patientFromRow(row: PatientRow): Patient {
  const tone = tones[row.first_name.length % tones.length];
  return {
    id: row.id,
    practiceId: row.practice_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dob: row.dob,
    gender: (row.gender as Gender) || 'unknown',
    ppsNumber: row.pps_number ?? '',
    gmsNumber: row.gms_number ?? '',
    ihiNumber: row.ihi_number ?? '',
    medicalCardType: (row.medical_card_type as MedicalCardType) || 'none',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    eircode: row.eircode ?? '',
    pharmacyName: row.pharmacy_name ?? '',
    pharmacyHealthmail: row.pharmacy_healthmail ?? '',
    allergies: row.allergies ?? 'NKDA',
    smokingStatus: (row.smoking_status as SmokingStatus) || 'unknown',
    gdprConsent: Boolean(row.gdpr_consent),
    sileConsent: Boolean(row.sile_consent),
    householdId: row.household_id ?? row.id,
    isPrimary: row.is_primary !== false,
    relationship: (row.relationship as HouseholdRelationship) || 'self',
    chronicConditions: Array.isArray(row.chronic_conditions) ? row.chronic_conditions.map(String) : [],
    colour: tone,
    createdAt: row.created_at,
  };
}

// chronic_conditions is managed by the CDM module (see db.ts
// updatePatientConditions), not by generic patient edits.
export function patientToRow(patient: Patient) {
  return {
    id: patient.id,
    practice_id: patient.practiceId,
    first_name: patient.firstName,
    last_name: patient.lastName,
    dob: patient.dob,
    gender: patient.gender,
    pps_number: patient.ppsNumber,
    gms_number: patient.gmsNumber,
    ihi_number: patient.ihiNumber,
    medical_card_type: patient.medicalCardType,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    eircode: patient.eircode,
    pharmacy_name: patient.pharmacyName,
    pharmacy_healthmail: patient.pharmacyHealthmail,
    allergies: patient.allergies,
    smoking_status: patient.smokingStatus,
    gdpr_consent: patient.gdprConsent,
    sile_consent: patient.sileConsent,
    household_id: patient.householdId,
    is_primary: patient.isPrimary,
    relationship: patient.relationship,
  };
}

export interface AppointmentRow {
  id: string;
  practice_id: string;
  patient_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  type: string | null;
  status: string | null;
  booked_via: string | null;
  sile_triage_notes: string | null;
  reminder_sent: boolean | null;
}

export interface WaitingRoomRow {
  id: string;
  appointment_id: string;
  arrived_at: string | null;
  called_in_at: string | null;
  completed_at: string | null;
  wait_minutes: number | null;
}

export function appointmentFromRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    practiceId: row.practice_id,
    patientId: row.patient_id,
    staffId: row.staff_id,
    startTime: row.start_time,
    endTime: row.end_time,
    type: (row.type as AppointmentType) || 'routine',
    status: (row.status as AppointmentStatus) || 'scheduled',
    bookedVia: (row.booked_via as Appointment['bookedVia']) || 'reception',
    sileTriageNotes: row.sile_triage_notes ?? '',
    reminderSent: Boolean(row.reminder_sent),
  };
}

export function appointmentToRow(item: Appointment) {
  return {
    id: item.id,
    practice_id: item.practiceId,
    patient_id: item.patientId,
    staff_id: item.staffId,
    start_time: item.startTime,
    end_time: item.endTime,
    type: item.type,
    status: item.status,
    booked_via: item.bookedVia,
    sile_triage_notes: item.sileTriageNotes,
    reminder_sent: item.reminderSent,
  };
}

export function waitingFromRow(row: WaitingRoomRow): WaitingRoomEntry {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    arrivedAt: row.arrived_at ?? new Date().toISOString(),
    calledInAt: row.called_in_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    waitMinutes: row.wait_minutes ?? 0,
  };
}

export interface InvoiceRow {
  id: string;
  practice_id: string;
  patient_id: string;
  appointment_id: string | null;
  staff_id: string | null;
  billing_source: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
  pcrs_claim_id: string | null;
  insurer_claim_ref: string | null;
  stripe_payment_id: string | null;
  payment_link_url: string | null;
  payment_method: string | null;
  description: string | null;
  issued_at: string | null;
}

export function invoiceFromRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    practiceId: row.practice_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id ?? undefined,
    staffId: row.staff_id ?? '',
    billingSource: (row.billing_source ?? 'private') as Invoice['billingSource'],
    amount: Number(row.amount ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    status: (row.status ?? 'unbilled') as InvoiceStatus,
    pcrsClaimId: row.pcrs_claim_id ?? undefined,
    insurerClaimRef: row.insurer_claim_ref ?? undefined,
    stripePaymentId: row.stripe_payment_id ?? undefined,
    paymentLinkUrl: row.payment_link_url ?? undefined,
    paymentMethod: (row.payment_method ?? undefined) as Invoice['paymentMethod'],
    description: row.description ?? undefined,
    issuedAt: row.issued_at ?? new Date().toISOString(),
  };
}

// ---------- CDM programme ----------

export interface CdmEnrolmentRow {
  id: string;
  practice_id: string | null;
  patient_id: string;
  condition: string | null;
  enrolled_date: string | null;
  consent_signed: boolean | null;
  status: string | null;
  next_review_date: string | null;
}

export function cdmEnrolmentFromRow(row: CdmEnrolmentRow): CdmEnrolment {
  return {
    id: row.id,
    patientId: row.patient_id,
    condition: (row.condition ?? 'dm2') as CdmEnrolment['condition'],
    enrolledDate: row.enrolled_date ?? new Date().toISOString().slice(0, 10),
    consentSigned: Boolean(row.consent_signed),
    status: (row.status === 'withdrawn' ? 'withdrawn' : 'active'),
    nextReviewDate: row.next_review_date ?? undefined,
  };
}

export interface CdmReviewRow {
  id: string;
  practice_id: string | null;
  patient_id: string;
  enrolment_id: string | null;
  reviewer_id: string | null;
  review_type: string | null;
  review_data_json: Record<string, unknown> | null;
  cdr_submitted: boolean | null;
  pcrs_claim_id: string | null;
  completed_at: string | null;
  nurse_signed: boolean | null;
  gp_signed: boolean | null;
}

export function cdmReviewFromRow(row: CdmReviewRow): CdmReview {
  return {
    id: row.id,
    patientId: row.patient_id,
    enrolmentId: row.enrolment_id ?? '',
    reviewerId: row.reviewer_id ?? '',
    reviewType: (row.review_type === 'gp' ? 'gp' : 'nurse'),
    reviewData: (row.review_data_json ?? {}) as CdmReview['reviewData'],
    cdrSubmitted: Boolean(row.cdr_submitted),
    pcrsClaimId: row.pcrs_claim_id ?? undefined,
    completedAt: row.completed_at ?? undefined,
    nurseSigned: Boolean(row.nurse_signed),
    gpSigned: Boolean(row.gp_signed),
  };
}
