import {
  appointmentFromRow,
  appointmentToRow,
  patientFromRow,
  patientToRow,
  staffFromRow,
  waitingFromRow,
  type AppointmentRow,
  type PatientRow,
  type PracticeRow,
  type StaffRow,
  type WaitingRoomRow,
} from '@/lib/mappers';
import { supabase } from '@/lib/supabase';
import type { Appointment, AppointmentStatus, Patient, Staff, WaitingRoomEntry } from '@/types/domain';

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
