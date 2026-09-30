import {
  appointmentFromRow,
  appointmentToRow,
  invoiceFromRow,
  patientFromRow,
  patientToRow,
  staffFromRow,
  waitingFromRow,
  type AppointmentRow,
  type InvoiceRow,
  type PatientRow,
  type PracticeRow,
  type StaffRow,
  type WaitingRoomRow,
} from '@/lib/mappers';
import { getSupabaseConfig, supabase } from '@/lib/supabase';
import type { Appointment, AppointmentStatus, Invoice, Patient, Staff, WaitingRoomEntry } from '@/types/domain';

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
  const { data, error } = await supabase.from('patients').select('*').order('last_name');
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
  const { data, error } = await supabase.from('invoices').select('*').order('issued_at', { ascending: false });
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

/** True when the practice has connected its own Stripe key (optional feature). */
export async function fetchStripeConnected(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from('practice_vault_refs').select('stripe_secret_id').maybeSingle();
  return Boolean(data?.stripe_secret_id);
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
