import { useEffect } from 'react';
import {
  fetchAppointments,
  fetchPatients,
  fetchStaffMembers,
  fetchWaitingRoom,
  insertAppointment,
  insertWaitingRoom,
  updateAppointmentStatus,
  updateWaitingRoom,
} from '@/lib/db';
import { detectEmergency, emergencyScript } from '@/lib/sile';
import { notifyBookingEmail, pushAppointmentToGoogle } from '@/lib/google-calendar';
import { supabaseConfigured } from '@/lib/supabase';
import { nowIso } from '@/lib/utils';
import { appStore } from '@/stores/appStore';
import type { Appointment, AppointmentStatus } from '@/types/domain';

export async function refreshSchedule() {
  if (!supabaseConfigured) return;
  const [patients, staff, appointments, waiting] = await Promise.all([
    fetchPatients(),
    fetchStaffMembers(),
    fetchAppointments(),
    fetchWaitingRoom(),
  ]);
  appStore.mergePatients(patients);
  staff.forEach((member) => appStore.upsertStaff(member));
  appStore.setSchedule(appointments, waiting);
}

export function useScheduleSync() {
  useEffect(() => {
    void refreshSchedule();
  }, []);
}

export async function bookAppointmentRemote(
  input: Omit<Appointment, 'id' | 'practiceId' | 'reminderSent'>,
): Promise<{ error?: string; appointment?: Appointment; emergency?: string }> {
  if (detectEmergency(input.sileTriageNotes)) {
    return { emergency: emergencyScript() };
  }
  const local = appStore.bookAppointment(input);
  if (!supabaseConfigured) return { appointment: local };
  const { error, appointment } = await insertAppointment(local);
  if (error) return { error: error.message };
  if (appointment) {
    appStore.mergeAppointments([appointment]);
    await pushAppointmentToGoogle(appointment.id);
    await notifyBookingEmail(appointment.id, 'booked');
    await refreshSchedule();
  }
  return { appointment: appointment ?? local };
}

export async function setAppointmentStatusRemote(appointmentId: string, status: AppointmentStatus) {
  appStore.setAppointmentStatus(appointmentId, status);
  if (!supabaseConfigured) return { error: undefined as string | undefined };
  const { error } = await updateAppointmentStatus(appointmentId, status);
  if (error) return { error: error.message };
  if (status === 'cancelled') {
    await pushAppointmentToGoogle(appointmentId);
    await notifyBookingEmail(appointmentId, 'cancelled');
  }
  if (status === 'checked_in') {
    await insertWaitingRoom(appointmentId);
  }
  if (status === 'completed') {
    await updateWaitingRoom(appointmentId, { completed_at: nowIso() });
  }
  await refreshSchedule();
  return { error: undefined as string | undefined };
}

export async function callInRemote(appointmentId: string) {
  const wait = appStore.get().waitingRoom.find((item) => item.appointmentId === appointmentId);
  const minutes = wait ? Math.round((Date.now() - new Date(wait.arrivedAt).getTime()) / 60000) : 0;
  appStore.callIn(appointmentId);
  if (!supabaseConfigured) return;
  await updateAppointmentStatus(appointmentId, 'in_progress');
  await updateWaitingRoom(appointmentId, { called_in_at: nowIso(), wait_minutes: minutes });
  await refreshSchedule();
}
