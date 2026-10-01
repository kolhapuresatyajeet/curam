import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react';
import { useLocation } from 'wouter';
import { AppButton, Avatar, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { bookAppointmentRemote, setAppointmentStatusRemote, useScheduleSync } from '@/lib/schedule';
import { supabaseConfigured } from '@/lib/supabase';
import { dublinDate, formatTime } from '@/lib/utils';
import { useAppState } from '@/stores/appStore';
import { patientName, type AppointmentType } from '@/types/domain';
import { ROLE_LABEL } from '@/lib/permissions';

/* ------------------------------------------------------------------ */
/* Types, colours, helpers                                             */
/* ------------------------------------------------------------------ */

const TYPE_META: Record<AppointmentType, { label: string; cls: string; dot: string }> = {
  routine: { label: 'Routine', cls: 'calendar-blue', dot: 'bg-[#397db5]' },
  urgent: { label: 'Urgent', cls: 'calendar-coral', dot: 'bg-[#c45148]' },
  cdm: { label: 'CDM review', cls: 'calendar-purple', dot: 'bg-[#8463a9]' },
  nurse: { label: 'Nurse', cls: 'calendar-teal', dot: 'bg-[#0d8c6c]' },
  phone: { label: 'Phone', cls: 'calendar-amber', dot: 'bg-[#ca8d15]' },
  video: { label: 'Video', cls: 'calendar-blue', dot: 'bg-[#397db5]' },
  home_visit: { label: 'Home visit', cls: 'calendar-slate', dot: 'bg-[#64748b]' },
  vaccination: { label: 'Vaccination', cls: 'calendar-teal', dot: 'bg-[#0d8c6c]' },
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: '',
  confirmed: '',
  checked_in: 'ring-1 ring-amber-300',
  in_progress: 'ring-2 ring-teal-500',
  completed: 'opacity-60',
  dna: 'opacity-70 line-through',
  cancelled: 'opacity-40 line-through',
};

const STATUS_GLYPH: Record<string, string> = {
  confirmed: '✓',
  checked_in: '✓',
  in_progress: '●',
  dna: '✕',
};

function isLiveId(id: string) {
  return !supabaseConfigured || id.includes('-');
}

const HOUR_PX = 64;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const DAY_START_MIN = DAY_START_HOUR * 60;
const LUNCH_START = 13 * 60;
const LUNCH_END = 14 * 60;

function minsFromIso(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function slotBox(startIso: string, endIso: string) {
  const startMin = minsFromIso(startIso);
  const rawEnd = minsFromIso(endIso);
  const duration = Number.isFinite(rawEnd - startMin) && rawEnd - startMin > 0 && rawEnd - startMin <= 240 ? rawEnd - startMin : 20;
  return {
    top: ((startMin - DAY_START_MIN) / 60) * HOUR_PX,
    height: Math.max((duration / 60) * HOUR_PX, 18),
    duration,
  };
}

/** Monday of the week containing the given YYYY-MM-DD. */
function mondayOf(day: string) {
  const d = new Date(`${day}T00:00:00`);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(day: string, n: number) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

const DAY_LONG = new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const DAY_SHORT = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });

const HOURS: number[] = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

function slotTimeFromClick(e: React.MouseEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const rawMin = DAY_START_MIN + (y / HOUR_PX) * 60;
  const min = Math.max(DAY_START_MIN, Math.floor(rawMin / 15) * 15);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  useScheduleSync();
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Day');
  const clinicians = state.staff.filter((item) => (item.role === 'gp' || item.role === 'nurse') && isLiveId(item.id));
  const [day, setDay] = useState(dublinDate());
  const panel = state.patients.filter((patient) => isLiveId(patient.id));
  const allLive = state.appointments.filter((item) => isLiveId(item.id) && item.status !== 'cancelled');
  const appointments = useMemo(() => allLive.filter((item) => dublinDate(item.startTime) === day), [allLive, day]);
  const [booking, setBooking] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [patientId, setPatientId] = useState(panel[0]?.id ?? '');
  const [staffId, setStaffId] = useState(clinicians[0]?.id ?? '');
  const [type, setType] = useState<AppointmentType>('routine');
  const [time, setTime] = useState('14:00');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Scroll the diary to a sensible position on first paint (around opening time).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, ((Math.max(nowMin - 30, DAY_START_MIN) - DAY_START_MIN) / 60) * HOUR_PX - 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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

  const selected = allLive.find((item) => item.id === selectedId);
  const selectedPatient = selected ? panel.find((p) => p.id === selected.patientId) : undefined;
  const selectedClinician = selected ? clinicians.find((c) => c.id === selected.staffId) : undefined;

  const isToday = day === dublinDate();
  const nowOffset = ((nowMin - DAY_START_MIN) / 60) * HOUR_PX;

  const openBooking = (prefillStaff?: string, prefillTime?: string) => {
    if (prefillStaff) setStaffId(prefillStaff);
    if (prefillTime) setTime(prefillTime);
    setBooking(true);
  };

  /* ---------------- Day view: one column per clinician ---------------- */
  const dayGrid = (
    <div className="grid" style={{ gridTemplateColumns: `56px repeat(${Math.max(clinicians.length, 1)}, minmax(170px, 1fr))` }}>
      {/* time gutter */}
      <div>
        <div className="h-14 border-b border-slate-100" />
        {HOURS.map((hour) => (
          <div key={hour} className="relative h-[64px] border-b border-slate-100 pr-2 text-right">
            <span className="absolute -top-[6px] right-2 font-mono text-[10px] text-slate-400">
              {String(hour).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>
      {(clinicians.length ? clinicians : [{ id: 'none', name: 'No clinicians', role: 'gp' as const }]).map((clinician) => (
        <div key={clinician.id} className="relative border-l border-slate-100 first:border-l-0">
          {/* 15-min slot target: clicking empty space opens a prefilled booking */}
          <div
            className="absolute inset-0 cursor-pointer"
            title="Click to book a 20-minute appointment"
            onClick={(e) => openBooking(clinician.id, slotTimeFromClick(e))}
          />
          {HOURS.map((hour) => (
            <div key={hour} className="pointer-events-none h-[64px] border-b border-slate-100" />
          ))}
          {/* lunch shading */}
          <div
            className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,.06)_6px,rgba(100,116,139,.06)_12px)]"
            style={{ top: ((LUNCH_START - DAY_START_MIN) / 60) * HOUR_PX, height: ((LUNCH_END - LUNCH_START) / 60) * HOUR_PX }}
          />
          {(byStaff[clinician.id] ?? []).map((apt) => {
            const patient = panel.find((p) => p.id === apt.patientId);
            const box = slotBox(apt.startTime, apt.endTime);
            const meta = TYPE_META[apt.type] ?? TYPE_META.routine;
            return (
              <div
                key={apt.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(apt.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(apt.id);
                  }
                }}
                className={`calendar-event ${meta.cls} ${STATUS_STYLE[apt.status] ?? ''} overflow-hidden rounded-md px-2 py-1`}
                style={{ top: box.top, height: box.height, minHeight: box.height, maxHeight: box.height }}
              >
                <span className="font-mono text-[9px] leading-none opacity-80">
                  {formatTime(apt.startTime)}–{formatTime(apt.endTime)}
                </span>
                <span className="block truncate text-[11px] font-semibold leading-tight">
                  {STATUS_GLYPH[apt.status] ? `${STATUS_GLYPH[apt.status]} ` : ''}
                  {patient ? patientName(patient) : 'Unknown'}
                </span>
                {box.height >= 40 && <span className="block truncate text-[9px] leading-tight opacity-75">{meta.label}</span>}
              </div>
            );
          })}
          {isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_HOUR * 60 && (
            <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowOffset }}>
              <div className="relative h-0 border-t-[1.5px] border-red-400/80">
                <span className="absolute -left-1 -top-[3.5px] h-1.5 w-1.5 rounded-full bg-red-400" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  /* ---------------- Week view: 7 day columns ---------------- */
  const monday = mondayOf(day);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysIso(toIsoDate(monday), i));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const weekGrid = (
    <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, minmax(120px, 1fr))` }}>
      <div>
        <div className="h-14 border-b border-slate-100" />
        {HOURS.map((hour) => (
          <div key={hour} className="relative h-[64px] border-b border-slate-100 pr-2 text-right">
            <span className="absolute -top-[6px] right-2 font-mono text-[10px] text-slate-400">{String(hour).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>
      {weekDays.map((d, idx) => {
        const dayApts = allLive.filter((a) => dublinDate(a.startTime) === d);
        const weekend = idx >= 5;
        return (
          <div key={d} className="relative border-l border-slate-100 first:border-l-0">
            {HOURS.map((hour) => (
              <div key={hour} className={`h-[64px] border-b border-slate-100 ${weekend ? 'bg-slate-50/60' : ''}`} />
            ))}
            {dayApts.map((apt) => {
              const patient = panel.find((p) => p.id === apt.patientId);
              const clinician = clinicians.find((c) => c.id === apt.staffId);
              const box = slotBox(apt.startTime, apt.endTime);
              const meta = TYPE_META[apt.type] ?? TYPE_META.routine;
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
                  className={`calendar-event ${meta.cls} ${STATUS_STYLE[apt.status] ?? ''} overflow-hidden rounded-md px-1.5 py-0.5`}
                  style={{ top: box.top, height: box.height, minHeight: 16, maxHeight: box.height }}
                >
                  <span className="block truncate text-[10px] font-semibold leading-tight">{patient ? patientName(patient) : 'Unknown'}</span>
                  {box.height >= 32 && (
                    <span className="block truncate text-[9px] leading-tight opacity-75">
                      {formatTime(apt.startTime)} · {clinician ? clinician.name.split(' ').slice(-1)[0] : '—'}
                    </span>
                  )}
                </div>
              );
            })}
            {d === dublinDate() && nowMin >= DAY_START_MIN && nowMin <= DAY_END_HOUR * 60 && (
              <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowOffset }}>
                <div className="h-0 border-t-[1.5px] border-red-400/80" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  /* ---------------- Month view: 6×7 grid ---------------- */
  const monthCells = useMemo(() => {
    const first = new Date(`${day.slice(0, 7)}-01T00:00:00`);
    const start = mondayOf(toIsoDate(first));
    return Array.from({ length: 42 }, (_, i) => addDaysIso(toIsoDate(start), i));
  }, [day]);

  const monthGrid = (
    <div className="grid grid-cols-7">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div key={d} className="border-b border-slate-100 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {d}
        </div>
      ))}
      {monthCells.map((d) => {
        const inMonth = d.slice(0, 7) === day.slice(0, 7);
        const dayApts = allLive.filter((a) => dublinDate(a.startTime) === d);
        const isTodayCell = d === dublinDate();
        return (
          <div
            key={d}
            role="button"
            tabIndex={0}
            onClick={() => {
              setDay(d);
              setView('Day');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setDay(d);
                setView('Day');
              }
            }}
            className={`min-h-[92px] cursor-pointer border-b border-r border-slate-100 px-1.5 py-1 transition hover:bg-teal-50/40 ${inMonth ? '' : 'bg-slate-50/50 text-slate-300'}`}
          >
            <div className="mb-1 flex items-center justify-end">
              <span className={`rounded-full px-1.5 text-[10px] font-semibold ${isTodayCell ? 'bg-teal-600 text-white' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>
                {Number(d.slice(8, 10))}
              </span>
            </div>
            {dayApts.slice(0, 3).map((apt) => {
              const meta = TYPE_META[apt.type] ?? TYPE_META.routine;
              const patient = panel.find((p) => p.id === apt.patientId);
              return (
                <div key={apt.id} className="mb-0.5 flex items-center gap-1 truncate rounded px-1 py-[1px] text-[9px]" title={`${formatTime(apt.startTime)} ${patient ? patientName(patient) : ''}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="truncate text-slate-600">{formatTime(apt.startTime)} {patient ? patientName(patient) : ''}</span>
                </div>
              );
            })}
            {dayApts.length > 3 && <div className="px-1 text-[9px] text-slate-400">+{dayApts.length - 3} more</div>}
          </div>
        );
      })}
    </div>
  );

  /* ---------------- Toolbar ---------------- */
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
      <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
        {(['Day', 'Week', 'Month'] as const).map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`calendar-view-${item.toLowerCase()}`}
            onClick={() => setView(item)}
            className={`rounded-md px-3 py-1 text-[11px] transition ${view === item ? 'bg-teal-600 font-medium text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button aria-label="Previous" className="px-2 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => setDay(addDaysIso(day, view === 'Day' ? -1 : view === 'Week' ? -7 : -28))}>
          <ChevronLeft size={15} />
        </button>
        <button className="px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50" onClick={() => setDay(dublinDate())}>
          Today
        </button>
        <button aria-label="Next" className="px-2 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => setDay(addDaysIso(day, view === 'Day' ? 1 : view === 'Week' ? 7 : 28))}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
        <CalendarDays size={14} className="text-slate-400" />
        {view === 'Day' && DAY_LONG.format(new Date(`${day}T00:00:00`))}
        {view === 'Week' && `${DAY_SHORT.format(monday)} – ${DAY_SHORT.format(new Date(`${addDaysIso(toIsoDate(monday), 6)}T00:00:00`))}`}
        {view === 'Month' && new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(new Date(`${day}T00:00:00`))}
      </div>
      <label className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-500 transition hover:border-teal-300">
        <CalendarDays size={13} />
        Pick date
        <input className="sr-only" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
    </div>
  );

  /* ---------------- Clinician header strip (Day view) ---------------- */
  const staffStrip = (
    <div className="grid border-b border-slate-200 bg-slate-50/70" style={{ gridTemplateColumns: `56px repeat(${Math.max(clinicians.length, 1)}, minmax(170px, 1fr))` }}>
      <div className="h-14 border-r border-slate-100" />
      {(clinicians.length ? clinicians : []).map((clinician) => (
        <div key={clinician.id} className="flex h-14 items-center gap-2 border-r border-slate-100 px-3 last:border-r-0">
          <Avatar name={clinician.name} size="sm" tone={clinician.colour} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px] font-semibold text-slate-700">{clinician.name}</div>
            <div className="truncate text-[10px] text-slate-400">
              {ROLE_LABEL[clinician.role]}
              {clinician.googleCalendarId ? ' · Google' : ''}
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{byStaff[clinician.id]?.length ?? 0}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow="Practice diary"
        title="Calendar"
        description={`${appointments.length} appointment${appointments.length === 1 ? '' : 's'} · ${DAY_LONG.format(new Date(`${day}T00:00:00`))}`}
        action={
          <div className="flex gap-2">
            <AppButton size="sm" icon={Plus} testId="button-new-appointment" onClick={() => openBooking()}>
              New appointment
            </AppButton>
            <AppButton size="sm" variant="secondary" onClick={() => setLocation('/waiting-room')}>
              Waiting room
            </AppButton>
          </div>
        }
      />

      <div className="surface overflow-hidden rounded-xl">
        {toolbar}

        {view === 'Day' && (
          <>
            {/* legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Legend</span>
              {Object.values(TYPE_META).map((meta) => (
                <span key={meta.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                </span>
              ))}
              <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                <span className="h-0.5 w-4 border-t-[1.5px] border-red-400" /> now · click a slot to book
              </span>
            </div>
            {staffStrip}
            <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto">
              {dayGrid}
              {clinicians.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-400">No GPs or nurses on the rota — add staff in Staff &amp; rota.</div>
              )}
            </div>
          </>
        )}

        {view === 'Week' && (
          <div className="max-h-[62vh] overflow-y-auto">
            <div className="grid border-b border-slate-200 bg-slate-50/70" style={{ gridTemplateColumns: `56px repeat(7, minmax(120px, 1fr))` }}>
              <div className="h-11 border-r border-slate-100" />
              {weekDays.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDay(d);
                    setView('Day');
                  }}
                  className={`flex h-11 flex-col items-start justify-center border-r border-slate-100 px-2 text-left transition hover:bg-teal-50/50 ${d === day ? 'bg-teal-50' : ''}`}
                >
                  <span className={`text-[11px] font-semibold ${d === dublinDate() ? 'text-teal-700' : 'text-slate-600'}`}>
                    {dayNames[i]} {Number(d.slice(8, 10))}
                  </span>
                  <span className="text-[9px] text-slate-400">{allLive.filter((a) => dublinDate(a.startTime) === d).length} appts</span>
                </button>
              ))}
            </div>
            {weekGrid}
          </div>
        )}

        {view === 'Month' && monthGrid}
      </div>

      {view === 'Day' && (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
          <Video size={11} /> Video consults open the room from the appointment record. Slots are 20 minutes unless changed.
        </p>
      )}

      {selected && (
        <div className="surface mt-4 flex max-w-lg flex-wrap items-center gap-2 rounded-xl p-4">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{selectedPatient ? patientName(selectedPatient) : 'Appointment'}</div>
            <div className="text-[11px] text-slate-500">
              {formatTime(selected.startTime)}–{formatTime(selected.endTime)} · {(TYPE_META[selected.type] ?? TYPE_META.routine).label} · {selected.bookedVia}
              {selectedClinician ? ` · ${selectedClinician.name}` : ''}
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
            <p className="text-[11px] text-slate-500">Date {DAY_LONG.format(new Date(`${day}T00:00:00`))} (change the diary date above if needed).</p>
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
                {Object.entries(TYPE_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
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
