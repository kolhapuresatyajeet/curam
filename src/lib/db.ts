import {
  appointmentFromRow,
  appointmentToRow,
  cdmEnrolmentFromRow,
  cdmReviewFromRow,
  invoiceFromRow,
  patientFromRow,
  patientToRow,
  staffFromRow,
  waitingFromRow,
  type AppointmentRow,
  type CdmEnrolmentRow,
  type CdmReviewRow,
  type InvoiceRow,
  type PatientRow,
  type PracticeRow,
  type StaffRow,
  type WaitingRoomRow,
} from '@/lib/mappers';
import { getSupabaseConfig, supabase } from '@/lib/supabase';
import type { Appointment, AppointmentStatus, CdmEnrolment, CdmReview, Invoice, Patient, Staff, WaitingRoomEntry } from '@/types/domain';

export async function fetchStaffForUser(userId: string): Promise<Staff | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('staff').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return staffFromRow(data as StaffRow);
}

export async function fetchPractice(practiceId: string): Promise<PracticeRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('practices').select('*').eq('id', practiceId).maybeSingle();
  if (error || !data) return null;
  return data as PracticeRow;
}

export async function fetchPatients(): Promise<Patient[]> {
  if (!supabase) return [];
  // Bounded page size — the list UI paginates client-side from here.
  const { data, error } = await supabase.from('patients').select('*').order('last_name').limit(1000);
  if (error || !data) return [];
  return (data as PatientRow[]).map(patientFromRow);
}

export async function insertPatient(patient: Patient) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase.from('patients').insert(patientToRow(patient));
  return { error };
}

export async function bootstrapPractice(input: {
  userId: string;
  email: string;
  practiceName: string;
  address: string;
  eircode: string;
  phone: string;
  staffName: string;
  role: Staff['role'];
}) {
  if (!supabase) return { error: new Error('Supabase is not configured'), staff: null as Staff | null };
  const { data, error } = await supabase.rpc('bootstrap_practice', {
    p_name: input.practiceName,
    p_address: input.address,
    p_eircode: input.eircode,
    p_phone: input.phone,
    p_staff_name: input.staffName,
  });
  if (error || !data) {
    return { error: error ?? new Error('Could not create practice'), staff: null };
  }
  const payload = data as { practice: PracticeRow; staff: StaffRow };
  if (!payload.practice || !payload.staff) {
    return { error: new Error('Could not create practice'), staff: null };
  }
  return {
    error: null,
    staff: staffFromRow(payload.staff),
    practice: payload.practice,
  };
}

export async function fetchStaffMembers(): Promise<Staff[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('staff').select('*').eq('active', true);
  if (error || !data) return [];
  return (data as StaffRow[]).map(staffFromRow);
}

export async function fetchInvoices(): Promise<Invoice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('invoices').select('*').order('issued_at', { ascending: false }).limit(500);
  if (error || !data) return [];
  return (data as InvoiceRow[]).map(invoiceFromRow);
}

export async function updateInvoicePayment(
  invoiceId: string,
  paidAmount: number,
  status: Invoice['status'],
  method: 'cash' | 'card' | 'stripe' = 'card',
) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase
    .from('invoices')
    .update({ paid_amount: paidAmount, status, payment_method: method })
    .eq('id', invoiceId);
  return { error };
}

/** Admin (gp/pm) onboards a staff member: DB row with user_id null until they sign in. */
export async function inviteStaffMember(input: { practiceId: string; name: string; role: Staff['role']; email: string }) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase.from('staff').insert({
    practice_id: input.practiceId,
    name: input.name,
    role: input.role,
    email: input.email,
    sessions: 'TBC',
    permissions: [input.role],
    active: true,
  });
  return { error };
}

/** Invitee claims their staff slot on first sign-in (matches by email). */
export async function claimStaffSlot(email: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('claim_staff_slot', { p_email: email });
  return !error && Boolean(data);
}

async function authedPost(path: string, body: Record<string, unknown>) {
  if (!supabase) return { ok: false, payload: { error: 'Supabase is not configured' } };
  const { url, anonKey } = getSupabaseConfig();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, payload: { error: 'Sign in first' } };
  const response = await fetch(`${url}/functions/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, payload };
}

/** Connect the signed-in clinician's own Healthmail account (password → Vault). */
export async function connectHealthmail(address: string, password: string) {
  return authedPost('healthmail-connect', { address, password });
}

/** Send an approved repeat request (or prescription) to the pharmacy via Healthmail. */
export async function sendViaHealthmail(ids: { prescriptionId?: string; repeatRequestId?: string }) {
  return authedPost('send-healthmail', ids);
}

export async function fetchAppointments(): Promise<Appointment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('appointments').select('*').order('start_time');
  if (error || !data) return [];
  return (data as AppointmentRow[]).map(appointmentFromRow);
}

export async function fetchWaitingRoom(): Promise<WaitingRoomEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('waiting_room').select('*');
  if (error || !data) return [];
  return (data as WaitingRoomRow[]).map(waitingFromRow);
}

export async function insertAppointment(appointment: Appointment) {
  if (!supabase) return { error: new Error('Supabase is not configured'), appointment: null as Appointment | null };
  const { data, error } = await supabase.from('appointments').insert(appointmentToRow(appointment)).select('*').single();
  if (error || !data) return { error: error ?? new Error('Could not book'), appointment: null };
  return { error: null, appointment: appointmentFromRow(data as AppointmentRow) };
}

export async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase.from('appointments').update({ status }).eq('id', appointmentId);
  return { error };
}

export async function insertWaitingRoom(appointmentId: string) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase.from('waiting_room').insert({
    appointment_id: appointmentId,
    arrived_at: new Date().toISOString(),
    wait_minutes: 0,
  });
  return { error };
}

export async function updateWaitingRoom(
  appointmentId: string,
  patch: { called_in_at?: string; completed_at?: string; wait_minutes?: number },
) {
  if (!supabase) return { error: new Error('Supabase is not configured') };
  const { error } = await supabase.from('waiting_room').update(patch).eq('appointment_id', appointmentId);
  return { error };
}

// ---------- CDM programme ----------

export async function fetchCdmEnrolments(): Promise<CdmEnrolment[]> {
  const { data, error } = await supabase!.from('cdm_enrolments').select('*').order('enrolled_date', { ascending: false });
  if (error || !data) return [];
  return (data as CdmEnrolmentRow[]).map(cdmEnrolmentFromRow);
}

export async function fetchCdmReviews(): Promise<CdmReview[]> {
  const { data, error } = await supabase!.from('cdm_reviews').select('*').order('id');
  if (error || !data) return [];
  return (data as CdmReviewRow[]).map(cdmReviewFromRow);
}

export async function enrolCdmPatient(input: {
  practiceId: string;
  patientId: string;
  condition: CdmEnrolment['condition'];
  nextReviewDate: string;
}): Promise<{ ok: boolean; enrolment?: CdmEnrolment; error?: string }> {
  const { data, error } = await supabase!
    .from('cdm_enrolments')
    .insert({
      practice_id: input.practiceId,
      patient_id: input.patientId,
      condition: input.condition,
      enrolled_date: new Date().toISOString().slice(0, 10),
      consent_signed: true, // consent captured in the enrol UI before insert
      status: 'active',
      next_review_date: input.nextReviewDate,
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  const enrolment = cdmEnrolmentFromRow(data as CdmEnrolmentRow);
  // Mirror the condition onto the patient record for future eligibility logic.
  const { data: patientRow } = await supabase!
    .from('patients')
    .select('chronic_conditions')
    .eq('id', input.patientId)
    .single();
  const existing: string[] = Array.isArray(patientRow?.chronic_conditions)
    ? (patientRow!.chronic_conditions as string[])
    : [];
  if (!existing.includes(input.condition)) {
    await supabase!
      .from('patients')
      .update({ chronic_conditions: [...existing, input.condition] })
      .eq('id', input.patientId);
  }
  return { ok: true, enrolment };
}

export async function withdrawCdmEnrolment(enrolmentId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase!
    .from('cdm_enrolments')
    .update({ status: 'withdrawn' })
    .eq('id', enrolmentId);
  return { ok: !error, error: error?.message };
}

export async function updatePatientConditions(patientId: string, conditions: string[]): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase!.from('patients').update({ chronic_conditions: conditions }).eq('id', patientId);
  return { ok: !error, error: error?.message };
}

// Nurse stage: store measurements and sign. Nurse/HCA completes, GP signs off.
export async function signCdmNurseReview(input: {
  reviewId: string;
  staffId: string;
  reviewData: Record<string, string | number>;
}): Promise<{ ok: boolean; review?: CdmReview; error?: string }> {
  const { data, error } = await supabase!
    .from('cdm_reviews')
    .update({
      reviewer_id: input.staffId,
      review_data_json: input.reviewData,
      nurse_signed: true,
    })
    .eq('id', input.reviewId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, review: cdmReviewFromRow(data as CdmReviewRow) };
}

export async function startCdmReview(input: {
  practiceId: string;
  enrolmentId: string;
  patientId: string;
  staffId: string;
  reviewType: 'nurse' | 'gp';
}): Promise<{ ok: boolean; review?: CdmReview; error?: string }> {
  const { data, error } = await supabase!
    .from('cdm_reviews')
    .insert({
      practice_id: input.practiceId,
      patient_id: input.patientId,
      enrolment_id: input.enrolmentId,
      reviewer_id: input.staffId,
      review_type: input.reviewType,
      review_data_json: {},
      nurse_signed: false,
      gp_signed: false,
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, review: cdmReviewFromRow(data as CdmReviewRow) };
}

// GP sign-off completes the review cycle and auto-generates the PCRS claim.
// STC code: CDM group claim. If no open claim exists for the patient the GP
// review creates one (status staged — submitted via the PCRS claims tab).
export async function signCdmGpReview(input: {
  reviewId: string;
  practiceId: string;
  patientId: string;
  staffId: string;
  reviewData: Record<string, string | number>;
  stcCode: string;
}): Promise<{ ok: boolean; review?: CdmReview; error?: string }> {
  const { data: claim, error: claimError } = await supabase!
    .from('pcrs_claims')
    .insert({
      practice_id: input.practiceId,
      patient_id: input.patientId,
      stc_code: input.stcCode,
      status: 'staged',
    })
    .select('id')
    .single();
  if (claimError) return { ok: false, error: `claim: ${claimError.message}` };

  const { data, error } = await supabase!
    .from('cdm_reviews')
    .update({
      reviewer_id: input.staffId,
      review_data_json: input.reviewData,
      gp_signed: true,
      completed_at: new Date().toISOString(),
      pcrs_claim_id: claim.id,
    })
    .eq('id', input.reviewId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  // Advance the enrolment's next review date by 6 months.
  const { data: enrolment } = await supabase!
    .from('cdm_reviews')
    .select('enrolment_id')
    .eq('id', input.reviewId)
    .single();
  if (enrolment?.enrolment_id) {
    const next = new Date();
    next.setMonth(next.getMonth() + 6);
    await supabase!
      .from('cdm_enrolments')
      .update({ next_review_date: next.toISOString().slice(0, 10) })
      .eq('id', enrolment.enrolment_id);
  }
  return { ok: true, review: cdmReviewFromRow(data as CdmReviewRow) };
}
