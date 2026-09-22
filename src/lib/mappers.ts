import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Gender,
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
    colour: tone,
    createdAt: row.created_at,
  };
}

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
