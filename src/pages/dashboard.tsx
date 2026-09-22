import { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FlaskConical,
  HeartPulse,
  Inbox,
  Pill,
  Plus,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { AppButton, Avatar, Badge, MetricCard, SectionTitle } from '@/components/shared/ui';
import { useScheduleSync } from '@/lib/schedule';
import { supabaseConfigured } from '@/lib/supabase';
import { formatEur, formatTime } from '@/lib/utils';
import { useAppState, useSessionStaff } from '@/stores/appStore';
import { patientName } from '@/types/domain';

const TYPE_LABEL: Record<string, string> = {
  routine: 'Routine consultation',
  urgent: 'Urgent appointment',
  cdm: 'CDM review',
  nurse: 'Nurse clinic',
  phone: 'Phone consultation',
  video: 'Video',
  home_visit: 'Home visit',
  vaccination: 'Vaccination',
};

export default function DashboardPage() {
  const state = useAppState();
  const staff = useSessionStaff();
  const [, setLocation] = useLocation();
  useScheduleSync();
  const today = new Date().toISOString().slice(0, 10);
  const todays = state.appointments.filter((item) => item.startTime.slice(0, 10) === today && (!supabaseConfigured || item.id.includes('-')));
  const unpaid = state.invoices.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + (item.amount - item.paidAmount), 0);
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow={state.practice.name}
        title={`Good morning, ${staff?.name.split(' ').slice(-1)[0] ?? ''}`}
        description="Here’s the shape of the practice today."
        action={
          <div className="flex gap-2">
            <AppButton size="sm" icon={Plus} onClick={() => setLocation('/calendar')}>
              New appointment
            </AppButton>
            <AppButton size="sm" variant="secondary" icon={UserPlus} onClick={() => setLocation('/patients/new')}>
              Add patient
            </AppButton>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Appointments today" value={String(todays.length)} detail="Live from the practice diary" icon={CalendarDays} tone="blue" />
        <MetricCard
          label="Needs attention"
          value={String(state.inbox.filter((i) => !i.read).length + state.labResults.filter((i) => !i.gpReviewed).length)}
          detail="Inbox + unread results"
          icon={AlertTriangle}
          tone="coral"
        />
        <MetricCard label="CDM enrolled" value={String(state.cdmEnrolments.filter((i) => i.status === 'active').length)} detail="Active programme" icon={HeartPulse} tone="purple" />
        <MetricCard label="Outstanding" value={formatEur(unpaid)} detail="Patient + claim balances" icon={CircleDollarSign} tone="amber" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <div className="surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Today’s appointments</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">{state.practice.hours}</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {(showAll ? todays : todays.slice(0, 5)).map((appointment) => {
              const patient = state.patients.find((item) => item.id === appointment.patientId);
              const clinician = state.staff.find((item) => item.id === appointment.staffId);
              if (!patient) return null;
              return (
                <div key={appointment.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[60px_1fr_145px_auto]">
                  <div className="font-mono text-[11px] text-slate-400">{formatTime(appointment.startTime)}</div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={patientName(patient)} size="sm" tone={patient.colour} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-700">{patientName(patient)}</div>
                      <div className="truncate text-[10px] text-slate-400">{TYPE_LABEL[appointment.type]}</div>
                    </div>
                  </div>
                  <div className="hidden text-[10px] text-slate-500 sm:block">{clinician?.name}</div>
                  <Badge tone={appointment.status === 'checked_in' ? 'teal' : appointment.status === 'confirmed' ? 'slate' : 'amber'}>{appointment.status.replace('_', ' ')}</Badge>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-100 px-4 py-2.5">
            <button type="button" className="text-[11px] font-medium text-teal-700" onClick={() => (showAll ? setLocation('/calendar') : setShowAll(true))}>
              {showAll ? 'Open calendar' : 'View more'} <ChevronRight size={13} className="ml-1 inline" />
            </button>
          </div>
        </div>
        <div className="surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Needs attention</h2>
          </div>
          {[
            { icon: FlaskConical, tone: 'coral', title: `${state.labResults.filter((i) => !i.gpReviewed).length} results to review`, target: '/healthlink' },
            { icon: Inbox, tone: 'blue', title: `${state.inbox.filter((i) => !i.read).length} messages`, target: '/inbox' },
            { icon: Pill, tone: 'amber', title: `${state.repeatRequests.filter((i) => i.status === 'pending').length} prescriptions pending`, target: '/prescriptions' },
          ].map((item) => (
            <button key={item.title} type="button" onClick={() => setLocation(item.target)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
              <span className={`icon-box icon-${item.tone}`}>
                <item.icon size={15} />
              </span>
              <span className="flex-1 text-xs font-semibold text-slate-700">{item.title}</span>
              <ChevronRight size={15} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[#e8f2ed] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="icon-box icon-teal">
            <Sparkles size={15} />
          </span>
          <h2 className="text-sm font-semibold text-slate-800">Síle’s briefing</h2>
        </div>
        <p className="text-[12px] leading-5 text-slate-600">
          {state.sileCalls.length} recent calls logged. Abnormal labs are held for GP callback and will never be delivered by voice AI.
        </p>
        <div className="mt-4">
          <AppButton size="sm" variant="primary" onClick={() => setLocation('/sile')}>
            Open Síle
          </AppButton>
        </div>
      </div>
    </div>
  );
}
