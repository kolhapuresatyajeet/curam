import { AppButton, Avatar, Badge, EmptyState, SectionTitle } from '@/components/shared/ui';
import { callInRemote, setAppointmentStatusRemote, useScheduleSync } from '@/lib/schedule';
import { supabaseConfigured } from '@/lib/supabase';
import { formatTime } from '@/lib/utils';
import { useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function WaitingRoomPage() {
  const state = useAppState();
  useScheduleSync();
  const today = new Date().toISOString().slice(0, 10);
  const rows = state.appointments
    .filter((item) => (!supabaseConfigured || item.id.includes('-')) && item.startTime.slice(0, 10) === today && item.status !== 'cancelled' && item.status !== 'completed')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="fade-in">
      <SectionTitle title="Waiting room" description="Check-in, wait times, call-in. Same appointments the voice agent can book." />
      <div className="surface divide-y rounded-xl">
        {rows.map((apt) => {
          const patient = state.patients.find((p) => p.id === apt.patientId);
          const wait = state.waitingRoom.find((w) => w.appointmentId === apt.id);
          if (!patient) return null;
          return (
            <div key={apt.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={patientName(patient)} size="sm" tone={patient.colour} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">{patientName(patient)}</div>
                <div className="text-[10px] text-slate-400">
                  {formatTime(apt.startTime)} · {apt.type} · {apt.bookedVia}
                </div>
              </div>
              <Badge tone={apt.status === 'checked_in' ? 'amber' : apt.status === 'in_progress' ? 'teal' : 'slate'}>{apt.status.replace('_', ' ')}</Badge>
              {wait && !wait.calledInAt && <span className="text-[10px] text-slate-500">Wait {Math.max(wait.waitMinutes, Math.round((Date.now() - new Date(wait.arrivedAt).getTime()) / 60000))} min</span>}
              {apt.status === 'scheduled' || apt.status === 'confirmed' ? (
                <>
                  <AppButton size="sm" onClick={() => void setAppointmentStatusRemote(apt.id, 'checked_in')}>
                    Check in
                  </AppButton>
                  <AppButton size="sm" variant="ghost" onClick={() => void setAppointmentStatusRemote(apt.id, 'cancelled')}>
                    Cancel
                  </AppButton>
                </>
              ) : null}
              {apt.status === 'checked_in' && (
                <AppButton size="sm" variant="primary" onClick={() => void callInRemote(apt.id)}>
                  Call in
                </AppButton>
              )}
              {apt.status === 'in_progress' && (
                <AppButton size="sm" onClick={() => void setAppointmentStatusRemote(apt.id, 'completed')}>
                  Complete
                </AppButton>
              )}
              <AppButton size="sm" variant="ghost" onClick={() => void setAppointmentStatusRemote(apt.id, 'dna')}>
                DNA
              </AppButton>
            </div>
          );
        })}
        {!rows.length && <EmptyState title="No patients waiting" detail="Booked slots from reception or Síle appear here on the day." />}
      </div>
    </div>
  );
}
