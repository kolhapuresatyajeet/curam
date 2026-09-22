import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import { AppButton, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { bookAppointmentRemote, setAppointmentStatusRemote, useScheduleSync } from '@/lib/schedule';
import { supabaseConfigured } from '@/lib/supabase';
import { dublinDate, formatTime } from '@/lib/utils';
import { useAppState } from '@/stores/appStore';
import { patientName, type AppointmentType } from '@/types/domain';

const COLOUR: Record<string, string> = {
  routine: 'blue',
  urgent: 'coral',
  cdm: 'purple',
  nurse: 'teal',
  phone: 'amber',
  video: 'blue',
  home_visit: 'slate',
  vaccination: 'teal',
};

function isLiveId(id: string) {
  return !supabaseConfigured || id.includes('-');
}

const HOUR_PX = 76;
const DAY_START_MIN = 8 * 60;

function slotBox(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const rawEnd = end.getHours() * 60 + end.getMinutes();
  const duration = Number.isFinite(rawEnd - startMin) && rawEnd > startMin && rawEnd - startMin <= 180
    ? rawEnd - startMin
    : 20;
  return {
    top: ((startMin - DAY_START_MIN) / 60) * HOUR_PX,
    height: (duration / 60) * HOUR_PX,
    duration,
  };
}

export default function CalendarPage() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  useScheduleSync();
  const [view, setView] = useState('Day');
  const clinicians = state.staff.filter((item) => (item.role === 'gp' || item.role === 'nurse') && isLiveId(item.id));
  const [day, setDay] = useState(dublinDate());
  const panel = state.patients.filter((patient) => isLiveId(patient.id));
  const appointments = state.appointments.filter(
    (item) => isLiveId(item.id) && item.status !== 'cancelled' && dublinDate(item.startTime) === day,
  );
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const [booking, setBooking] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [patientId, setPatientId] = useState(panel[0]?.id ?? '');
  const [staffId, setStaffId] = useState(clinicians[0]?.id ?? '');
  const [type, setType] = useState<AppointmentType>('routine');
  const [time, setTime] = useState('14:00');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patientId && panel[0]) setPatientId(panel[0].id);
    if (!staffId && clinicians[0]) setStaffId(clinicians[0].id);
  }, [panel, clinicians, patientId, staffId]);

  const byStaff = useMemo(() => {
    const map: Record<string, typeof appointments> = {};
    clinicians.forEach((c) => {
      map[c.id] = appointments.filter((a) => a.staffId === c.id);
    });
    return map;
  }, [appointments, clinicians]);

  const selected = appointments.find((item) => item.id === selectedId);
  const selectedPatient = selected ? panel.find((p) => p.id === selected.patientId) : undefined;
  const selectedClinician = selected ? clinicians.find((c) => c.id === selected.staffId) : undefined;

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow="Practice diary"
        title="Calendar"
        description={`${appointments.length} appointments ${day} · Ireland diary + Google Calendar`}
        action={
          <div className="flex gap-2">
            <AppButton size="sm" icon={Plus} testId="button-new-appointment" onClick={() => setBooking(true)}>
              New appointment
            </AppButton>
            <AppButton size="sm" variant="secondary" onClick={() => setLocation('/waiting-room')}>
              Waiting room
            </AppButton>
          </div>
        }
      />
      <div className="surface rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-1">
            {['Day', 'Week', 'Month'].map((item) => (
              <button key={item} type="button" onClick={() => setView(item)} className={`rounded-md px-3 py-1.5 text-[11px] ${view === item ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400'}`}>
                {item}
              </button>
            ))}
          </div>
          <input className={`${inputClass} w-auto`} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        {view === 'Day' && (
          <div className="grid overflow-x-auto" style={{ gridTemplateColumns: `58px repeat(${Math.max(clinicians.length, 1)}, minmax(160px, 1fr))` }}>
            <div className="pt-12">
              {hours.map((hour) => (
                <div key={hour} className="h-[76px] border-b border-slate-100 pr-2 pt-0.5 text-right font-mono text-[9px] leading-none text-slate-400">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {(clinicians.length ? clinicians : [{ id: 'none', name: 'No clinicians' }]).map((clinician) => (
              <div key={clinician.id}>
                <div className="h-12 border-b border-slate-100 px-3 pt-3 text-[11px] font-semibold text-slate-700">
                  {clinician.name}
                  {'googleCalendarId' in clinician && clinician.googleCalendarId ? (
                    <span className="ml-1 font-normal text-teal-700">· Google</span>
                  ) : null}
                </div>
                <div className="relative">
                  {byStaff[clinician.id]?.map((apt) => {
                    const patient = panel.find((p) => p.id === apt.patientId);
                    const box = slotBox(apt.startTime, apt.endTime);
                    return (
                      <div
                        key={apt.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(apt.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedId(apt.id);
                          }
                        }}
                        className={`calendar-event calendar-${COLOUR[apt.type] ?? 'blue'}`}
                        style={{ top: box.top, height: box.height, minHeight: box.height, maxHeight: box.height }}
                      >
                        <span className="font-mono text-[9px] leading-none">{formatTime(apt.startTime)}–{formatTime(apt.endTime)}</span>
                        <span className="block truncate text-[10px] font-semibold leading-tight">{patient ? patientName(patient) : 'Unknown'}</span>
                      </div>
                    );
                  })}
                  {hours.map((hour) => (
                    <div key={hour} className="h-[76px] border-b border-slate-100" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {view !== 'Day' && <div className="p-6 text-xs text-slate-500">Week and month views use the same Ireland appointment table. Use the date control in day view.</div>}
      </div>

      {selected && (
        <div className="surface mt-4 flex max-w-lg flex-wrap items-center gap-2 rounded-xl p-4">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{selectedPatient ? patientName(selectedPatient) : 'Appointment'}</div>
            <div className="text-[11px] text-slate-500">
              {formatTime(selected.startTime)}–{formatTime(selected.endTime)} · {selected.type} · {selected.bookedVia}
              {selectedClinician?.googleCalendarId ? ' · Google Calendar' : ''}
            </div>
          </div>
          <AppButton size="sm" variant="secondary" onClick={() => selectedPatient && setLocation(`/patients/${selectedPatient.id}`)}>
            Record
          </AppButton>
          {(selected.status === 'scheduled' || selected.status === 'confirmed') && (
            <AppButton
              size="sm"
              variant="danger"
              onClick={() => {
                void setAppointmentStatusRemote(selected.id, 'cancelled').then(() => setSelectedId(''));
              }}
            >
              Cancel
            </AppButton>
          )}
        </div>
      )}

      {booking && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16" onClick={() => setBooking(false)}>
          <div className="surface w-full max-w-lg space-y-3 rounded-xl p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-semibold">Book appointment</h2>
            <p className="text-[11px] text-slate-500">Date {day} (change the diary date above if needed).</p>
            <Field label="Patient">
              <select className={inputClass} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {panel.length === 0 && <option value="">No patients yet — register one first</option>}
                {panel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {patientName(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Clinician">
              <select className={inputClass} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {clinicians.length === 0 && <option value="">No GP/nurse on this practice</option>}
                {clinicians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as AppointmentType)}>
                {Object.keys(COLOUR).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <AppButton
                size="sm"
                variant="primary"
                testId="button-confirm-booking"
                onClick={() => {
                  void (async () => {
                    if (!patientId || !staffId) {
                      setError('Register a patient and complete practice setup first.');
                      return;
                    }
                    const start = new Date(`${day}T${time}:00`);
                    const result = await bookAppointmentRemote({
                      patientId,
                      staffId,
                      startTime: start.toISOString(),
                      endTime: new Date(start.getTime() + 20 * 60000).toISOString(),
                      type,
                      status: 'scheduled',
                      bookedVia: 'reception',
                      sileTriageNotes: '',
                    });
                    if (result.emergency) {
                      setError(result.emergency);
                      return;
                    }
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    setBooking(false);
                    setError('');
                  })();
                }}
              >
                Confirm booking
              </AppButton>
              <AppButton size="sm" variant="ghost" onClick={() => setBooking(false)}>
                Close
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
