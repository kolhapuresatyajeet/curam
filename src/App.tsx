import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link2, LayoutDashboard, CalendarDays, Inbox, Users, Pill, HeartPulse, ArrowUpRight, Receipt, Sparkles, ChartNoAxesCombined, UserCog, GitMerge, Settings, Search, Bell, ChevronDown, ChevronRight, Plus, Clock3, AlertTriangle, Check, X, MoreHorizontal, SlidersHorizontal, FlaskConical, Building2, MessageCircle, Phone, Stethoscope, ClipboardCheck, CreditCard, ShieldCheck, Mail, FileText, Activity, CircleDollarSign, Database, LockKeyhole, Menu, UserRound, LogOut, CheckCircle2, Send, RefreshCw, ListFilter, ArrowDownToLine, CalendarPlus, Brain, Mic2, UserPlus, BarChart3, type LucideIcon } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type Role = 'gp' | 'nurse' | 'manager' | 'reception';
type ModuleId = 'dashboard' | 'calendar' | 'healthlink' | 'inbox' | 'patients' | 'prescriptions' | 'cdm' | 'referrals' | 'billing' | 'sile' | 'insights' | 'staff' | 'workflows' | 'settings';

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, calendar: CalendarDays, healthlink: Link2, inbox: Inbox, patients: Users, prescriptions: Pill, cdm: HeartPulse, referrals: ArrowUpRight, billing: Receipt, sile: Sparkles, insights: ChartNoAxesCombined, staff: UserCog, workflows: GitMerge, settings: Settings,
  clock: Clock3, alert: AlertTriangle, search: Search, flask: FlaskConical, hospital: Building2, message: MessageCircle, phone: Phone, stethoscope: Stethoscope, check: CheckCircle2, credit: CreditCard, shield: ShieldCheck, mail: Mail, file: FileText, activity: Activity, coin: CircleDollarSign, database: Database, lock: LockKeyhole, refresh: RefreshCw, list: ListFilter, download: ArrowDownToLine, userPlus: UserPlus, calendarPlus: CalendarPlus, brain: Brain, mic: Mic2, chart: BarChart3,
};

const roles: { id: Role; label: string; name: string; title: string; initials: string }[] = [
  { id: 'gp', label: 'GP', name: 'Dr Sarah Murphy', title: 'GP Partner', initials: 'SM' },
  { id: 'nurse', label: 'Nurse', name: 'Aisling Brennan', title: 'Practice Nurse', initials: 'AB' },
  { id: 'manager', label: 'Manager', name: 'Claire Dempsey', title: 'Practice Manager', initials: 'CD' },
  { id: 'reception', label: 'Reception', name: 'Orla Flood', title: 'Receptionist', initials: 'OF' },
];

const navGroups: { label?: string; items: { id: ModuleId; label: string; icon: string; badge?: string; roles: Role[] }[] }[] = [
  { items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['gp', 'nurse', 'manager', 'reception'] },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', roles: ['gp', 'nurse', 'manager', 'reception'] },
    { id: 'healthlink', label: 'HealthLink', icon: 'healthlink', badge: '12', roles: ['gp', 'nurse'] },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '5', roles: ['gp', 'nurse', 'manager', 'reception'] },
    { id: 'patients', label: 'Patients', icon: 'patients', roles: ['gp', 'nurse', 'manager', 'reception'] },
  ] },
  { label: 'Clinical', items: [
    { id: 'prescriptions', label: 'Prescriptions', icon: 'prescriptions', badge: '6', roles: ['gp', 'nurse'] },
    { id: 'cdm', label: 'CDM programme', icon: 'cdm', roles: ['gp', 'nurse'] },
    { id: 'referrals', label: 'Referrals', icon: 'referrals', roles: ['gp'] },
  ] },
  { label: 'Practice', items: [
    { id: 'billing', label: 'Billing', icon: 'billing', roles: ['gp', 'manager', 'reception'] },
    { id: 'sile', label: 'Síle AI', icon: 'sile', roles: ['gp', 'manager'] },
    { id: 'insights', label: 'Insights', icon: 'insights', roles: ['gp', 'manager'] },
  ] },
  { label: 'Management', items: [
    { id: 'staff', label: 'Staff & rota', icon: 'staff', roles: ['gp', 'manager'] },
    { id: 'workflows', label: 'Workflows', icon: 'workflows', roles: ['gp', 'manager'] },
    { id: 'settings', label: 'Settings', icon: 'settings', roles: ['gp', 'manager'] },
  ] },
];

const patients = [
  { id: 'p1', name: "Mary O'Brien", detail: 'DOB 14 Mar 1964 · GMS', tag: 'DM2 · AF', colour: 'teal' },
  { id: 'p2', name: 'Tom Brennan', detail: 'DOB 26 Nov 1959 · VHI', tag: 'IHD · Warfarin', colour: 'blue' },
  { id: 'p3', name: 'Aoife Murphy', detail: 'DOB 05 Jan 1992 · Private', tag: 'Asthma', colour: 'amber' },
  { id: 'p4', name: 'Ciarán Doyle', detail: 'DOB 22 Aug 1951 · GMS', tag: 'DM2 · HTN', colour: 'purple' },
  { id: 'p5', name: 'Eileen Doyle', detail: 'DOB 17 Jun 1947 · GMS', tag: 'Heart failure', colour: 'coral' },
  { id: 'p6', name: 'Séamus Walsh', detail: 'DOB 01 Dec 1976 · Private', tag: 'Cardiology referral', colour: 'blue' },
  { id: 'p7', name: 'Margaret Dunne', detail: 'DOB 08 Sep 1958 · Laya', tag: 'Hypothyroid', colour: 'teal' },
];

const appointments = [
  { time: '08:30', patient: 'Pádraig Ó Sé', type: 'CDM review', clinician: 'Dr Murphy', colour: 'purple', status: 'Checked in' },
  { time: '08:50', patient: 'Aoife Murphy', type: 'Routine consultation', clinician: 'Dr Murphy', colour: 'blue', status: 'Waiting' },
  { time: '09:10', patient: 'Tom Brennan', type: 'INR check', clinician: "Dr O'Neill", colour: 'amber', status: 'Confirmed' },
  { time: '09:30', patient: 'Niamh Byrne', type: 'Phone consultation', clinician: 'Dr Shah', colour: 'teal', status: 'Confirmed' },
  { time: '09:50', patient: 'Ciarán Doyle', type: 'CDM review', clinician: 'Aisling', colour: 'purple', status: 'Confirmed' },
  { time: '10:10', patient: 'Eileen Doyle', type: 'Urgent appointment', clinician: 'Dr Murphy', colour: 'coral', status: 'Confirmed' },
];

const healthlinkRows = [
  { type: 'Lab result', icon: 'flask', patient: "Mary O'Brien", preview: 'HbA1c 8.2% (H), U&E, Lipids — chol 5.8 (H)', from: 'St Vincent’s', time: '09:42', status: 'Urgent', tone: 'coral' },
  { type: 'Lab result', icon: 'flask', patient: 'Tom Brennan', preview: 'INR 3.8 (H) — above therapeutic range', from: 'Mater Hospital', time: '09:15', status: 'Urgent', tone: 'coral' },
  { type: 'Discharge', icon: 'hospital', patient: 'Eileen Doyle', preview: 'Heart failure exacerbation. Furosemide increased to 80mg', from: 'Beaumont', time: '08:20', status: 'New', tone: 'blue' },
  { type: 'Lab result', icon: 'flask', patient: 'Declan Fitzgerald', preview: 'FBC, TFT, LFT — all within normal range', from: 'St James’s', time: 'Yesterday', status: 'Normal', tone: 'teal' },
  { type: 'Referral ack', icon: 'referrals', patient: 'Séamus Walsh', preview: 'Mater Cardiology — waiting list 4–6 weeks', from: 'Mater', time: 'Yesterday', status: 'Filed', tone: 'purple' },
];

const rxRows = [
  { patient: 'Aoife Murphy', medicine: 'Salbutamol 100mcg', via: 'MyCúram app', date: 'Today', status: 'Pending', action: 'Approve' },
  { patient: 'Conor Ryan', medicine: 'Omeprazole 20mg', via: 'MyCúram app', date: 'Yesterday', status: 'Pending', action: 'Approve' },
  { patient: 'Karen Moran', medicine: 'Cetirizine 10mg', via: 'Síle call', date: 'Yesterday', status: 'Pending', action: 'Approve' },
  { patient: 'Eileen Doyle', medicine: 'Furosemide 80mg', via: 'Discharge', date: '12 Sep', status: 'New Rx', action: 'Prescribe' },
  { patient: 'Margaret Dunne', medicine: 'Levothyroxine 50mcg', via: 'App', date: '11 Sep', status: 'Sent', action: 'Sent' },
];

function initials(name: string) { return name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(); }
function toneClass(tone: string) { return `tone-${tone}`; }

function Avatar({ name, size = 'md', tone = 'blue' }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: string }) {
  return <span data-testid={`avatar-${name.replace(/\s+/g, '-').toLowerCase()}`} className={`avatar avatar-${size} avatar-${tone}`}>{initials(name)}</span>;
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${toneClass(tone)}`}>{children}</span>;
}

function Button({ children, variant = 'secondary', size = 'md', onClick, icon: Icon, disabled, testId }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; onClick?: () => void; icon?: LucideIcon; disabled?: boolean; testId?: string }) {
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className={`button button-${variant} button-${size}`}>{Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={1.8} />}{children}</button>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast-enter fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-teal-200 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><Check size={16} className="text-teal-300" /><span data-testid="status-toast">{message}</span><button data-testid="button-close-toast" onClick={onClose} className="ml-2 text-slate-400 hover:text-white"><X size={15} /></button></div>;
}

function Sidebar({ active, setActive, role, open, setOpen }: { active: ModuleId; setActive: (id: ModuleId) => void; role: Role; open: boolean; setOpen: (open: boolean) => void }) {
  const visibleGroups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) })).filter((group) => group.items.length);
  return <>
    {open && <button aria-label="Close navigation" data-testid="button-close-navigation" className="mobile-scrim md:hidden" onClick={() => setOpen(false)} />}
    <aside className={`sidebar sidebar-scroll ${open ? 'mobile-drawer' : 'hidden md:flex'} w-[244px] shrink-0 flex-col overflow-y-auto`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <div className="brand-mark"><HeartPulse size={20} strokeWidth={2.4} /></div>
        <div><div className="text-[17px] font-semibold tracking-[-.02em] text-white">Cúram</div><div className="text-[10px] uppercase tracking-[.16em] text-slate-400">GP management</div></div>
      </div>
      <div className="px-3 py-4">
        {visibleGroups.map((group, groupIndex) => <div key={group.label || 'main'} className={groupIndex ? 'mt-5' : ''}>
          {group.label && <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{group.label}</div>}
          <div className="space-y-0.5">{group.items.map((item) => {
            const Icon = iconMap[item.icon];
            const selected = active === item.id;
            return <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => { setActive(item.id); setOpen(false); }} className={`nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] ${selected ? 'active' : ''}`}>
              <Icon size={17} strokeWidth={selected ? 2 : 1.7} /><span className="flex-1">{item.label}</span>{item.badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${selected ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'}`}>{item.badge}</span>}
            </button>;
          })}</div>
        </div>)}
      </div>
      <div className="mt-auto border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/[.055] p-3"><div className="mb-2 flex items-center gap-2"><span className="pulse-dot h-2 w-2 rounded-full bg-teal-400" /><span className="text-[11px] text-slate-300">Practice systems healthy</span></div><div className="text-[10px] leading-4 text-slate-500">HealthLink synced 2 min ago</div></div>
        <button data-testid="button-account" className="mt-3 flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-white/[.06]"><Avatar name="Dr Sarah Murphy" size="sm" tone="teal" /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-slate-200">Dr Sarah Murphy</span><span className="block text-[10px] text-slate-500">GP Partner</span></span><MoreHorizontal size={16} className="text-slate-500" /></button>
      </div>
    </aside>
  </>;
}

function Header({ active, role, setRole, setOpen, onSearch }: { active: ModuleId; role: Role; setRole: (r: Role) => void; setOpen: (open: boolean) => void; onSearch: (value: string) => void }) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pageLabels: Record<ModuleId, string> = { dashboard: 'Good morning, Sarah', calendar: 'Calendar', healthlink: 'HealthLink', inbox: 'Inbox', patients: 'Patients', prescriptions: 'Prescriptions', cdm: 'CDM programme', referrals: 'Referrals', billing: 'Billing', sile: 'Síle AI', insights: 'Insights', staff: 'Staff & rota', workflows: 'Workflows', settings: 'Settings' };
  const currentRole = roles.find((item) => item.id === role) || roles[0];
  return <header className="flex min-h-[76px] items-center gap-3 border-b border-slate-200/80 bg-[#fbfaf7]/90 px-4 backdrop-blur md:px-8">
    <button data-testid="button-open-navigation" aria-label="Open navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
    <div className="min-w-0 flex-1"><div className="truncate text-[19px] font-semibold tracking-[-.025em] text-slate-800">{pageLabels[active]}</div><div className="hidden text-[11px] text-slate-500 sm:block">{active === 'dashboard' ? 'Friday, 13 September 2024 · Riverside Family Practice' : 'Riverside Family Practice · Dublin 8'}</div></div>
    <div className="relative hidden w-[230px] md:block"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input data-testid="input-global-search" value={search} onChange={(event) => { setSearch(event.target.value); onSearch(event.target.value); }} placeholder="Search patients, actions..." className="h-9 w-full rounded-lg border border-slate-200 bg-white/70 pl-9 pr-3 text-xs outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100" /><span className="absolute right-2.5 top-2 rounded border border-slate-200 px-1 text-[9px] text-slate-400">⌘ K</span></div>
    <button data-testid="button-notifications" className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"><Bell size={18} strokeWidth={1.8} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" /></button>
    <div className="relative">
      <button data-testid="button-role-switcher" onClick={() => setRoleOpen(!roleOpen)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/75 px-2 py-1.5 text-left transition hover:border-teal-300"><Avatar name={currentRole.name} size="sm" tone="teal" /><span className="hidden text-[11px] leading-4 sm:block"><span className="block font-medium text-slate-700">{currentRole.label}</span><span className="block text-[10px] text-slate-400">{currentRole.name.replace('Dr ', '')}</span></span><ChevronDown size={14} className="text-slate-400" /></button>
      {roleOpen && <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><div className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Switch workspace view</div>{roles.map((item) => <button key={item.id} data-testid={`button-role-${item.id}`} onClick={() => { setRole(item.id); setRoleOpen(false); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 ${item.id === role ? 'bg-teal-50' : ''}`}><Avatar name={item.name} size="sm" tone={item.id === 'manager' ? 'purple' : item.id === 'reception' ? 'amber' : 'teal'} /><span className="flex-1"><span className="block text-xs font-medium text-slate-700">{item.label}</span><span className="block text-[10px] text-slate-400">{item.title}</span></span>{item.id === role && <Check size={14} className="text-teal-600" />}</button>)}</div>}
    </div>
  </header>;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.15em] text-teal-700">{eyebrow}</div>}<h1 className="text-[21px] font-semibold tracking-[-.03em] text-slate-800">{title}</h1>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, detail, tone = 'teal', icon: Icon, trend }: { label: string; value: string; detail: string; tone?: string; icon: LucideIcon; trend?: string }) {
  return <div className="surface surface-lift rounded-xl p-4"><div className="mb-3 flex items-start justify-between"><span className={`icon-box icon-${tone}`}><Icon size={16} /></span>{trend && <span className={`text-[10px] font-medium ${trend.startsWith('↓') ? 'text-teal-700' : 'text-slate-500'}`}>{trend}</span>}</div><div className="text-[11px] text-slate-500">{label}</div><div className="mt-0.5 font-mono text-[23px] font-bold tracking-[-.04em] text-slate-800">{value}</div><div className="mt-1 text-[10px] text-slate-400">{detail}</div></div>;
}

function Dashboard({ go, toast }: { go: (id: ModuleId) => void; toast: (message: string) => void }) {
  const [selectedDate, setSelectedDate] = useState('Today');
  const [showAll, setShowAll] = useState(false);
  return <div className="fade-in">
    <SectionTitle eyebrow="Friday · 13 September 2024" title="Good morning, Sarah" description="Here’s the shape of the practice today." action={<div className="flex gap-2"><Button size="sm" icon={Plus} onClick={() => toast('New appointment flow opened')}>New appointment</Button><Button size="sm" variant="secondary" icon={UserPlus} onClick={() => go('patients')}>Add patient</Button></div>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Appointments today" value="34" detail="92% booked · 3 urgent slots" icon={CalendarDays} tone="blue" trend="↑ 4 vs last Friday" />
      <MetricCard label="Needs attention" value="12" detail="5 inbox · 4 results · 3 Rx" icon={AlertTriangle} tone="coral" trend="3 urgent" />
      <MetricCard label="CDM reviews due" value="38" detail="4 overdue · 18 booked by Síle" icon={HeartPulse} tone="purple" />
      <MetricCard label="Practice revenue" value="€1,840" detail="Today · €38,420 this month" icon={CircleDollarSign} tone="amber" trend="↑ 8% vs Aug" />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.8fr]">
      <div className="surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-800">Today’s appointments</h2><p className="mt-0.5 text-[11px] text-slate-400">Friday 13 September · 08:30–18:00</p></div><div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">{['Today', 'Tomorrow'].map((day) => <button key={day} data-testid={`button-date-${day.toLowerCase()}`} onClick={() => setSelectedDate(day)} className={`rounded-md px-2.5 py-1 text-[10px] ${selectedDate === day ? 'bg-white font-medium text-slate-700 shadow-sm' : 'text-slate-400'}`}>{day}</button>)}</div></div>
        <div className="divide-y divide-slate-100">{appointments.slice(0, showAll ? appointments.length : 5).map((appointment, index) => <div data-testid={`row-appointment-${index}`} key={appointment.time} className="group grid grid-cols-[52px_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:grid-cols-[60px_1fr_145px_auto]"><div className="font-mono text-[11px] text-slate-400">{appointment.time}</div><div className="flex min-w-0 items-center gap-2.5"><Avatar name={appointment.patient} size="sm" tone={appointment.colour} /><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-700">{appointment.patient}</div><div className="truncate text-[10px] text-slate-400">{appointment.type}</div></div></div><div className="hidden text-[10px] text-slate-500 sm:block">{appointment.clinician}</div><div className="flex items-center gap-2"><Badge tone={appointment.status === 'Waiting' ? 'amber' : appointment.status === 'Checked in' ? 'teal' : 'slate'}>{appointment.status}</Badge><button data-testid={`button-appointment-menu-${index}`} onClick={() => toast(`${appointment.patient}: appointment actions ready`)} className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"><MoreHorizontal size={15} /></button></div></div>)}</div>
        <div className="border-t border-slate-100 px-4 py-2.5"><button data-testid="button-show-appointments" onClick={() => setShowAll(!showAll)} className="text-[11px] font-medium text-teal-700 hover:text-teal-800">{showAll ? 'Show fewer appointments' : 'View full calendar'} <ChevronRight size={13} className="ml-1 inline" /></button></div>
      </div>
      <div className="surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-800">Needs attention</h2><p className="mt-0.5 text-[11px] text-slate-400">Prioritised for your role</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">12 open</span></div>
        <div className="divide-y divide-slate-100">{[
          { icon: FlaskConical, tone: 'coral', title: '2 urgent lab results', detail: "Mary O'Brien · Tom Brennan", target: 'healthlink' as ModuleId },
          { icon: Inbox, tone: 'blue', title: '5 messages to review', detail: '2 patient · 1 Healthmail · 2 internal', target: 'inbox' as ModuleId },
          { icon: Pill, tone: 'amber', title: '3 prescriptions pending', detail: 'Oldest request · 2 hours ago', target: 'prescriptions' as ModuleId },
          { icon: HeartPulse, tone: 'purple', title: '4 CDM reviews overdue', detail: 'Ciarán Doyle is 6 months overdue', target: 'cdm' as ModuleId },
        ].map((item) => <button key={item.title} data-testid={`button-attention-${item.target}`} onClick={() => go(item.target)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"><span className={`icon-box icon-${item.tone}`}><item.icon size={15} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-700">{item.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{item.detail}</span></span><ChevronRight size={15} className="text-slate-300" /></button>)}</div>
        <div className="border-t border-slate-100 px-4 py-2.5"><button data-testid="button-view-all-attention" onClick={() => go('inbox')} className="text-[11px] font-medium text-teal-700">View all attention items <ChevronRight size={13} className="ml-1 inline" /></button></div>
      </div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
      <div className="surface rounded-xl p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Practice pulse</h2><button data-testid="button-open-insights" onClick={() => go('insights')} className="text-[11px] text-teal-700">Open Insights</button></div><div className="flex items-end gap-1.5 h-20">{[44, 56, 51, 68, 62, 74, 82, 78, 91, 84, 88, 92].map((height, index) => <div key={index} className="group flex h-full flex-1 flex-col justify-end"><div style={{ height: `${height}%` }} className={`rounded-t-sm transition group-hover:bg-teal-500 ${index > 8 ? 'bg-teal-600' : 'bg-teal-200'}`} /></div>)}</div><div className="mt-2 flex justify-between text-[9px] text-slate-400"><span>Mon</span><span>Today</span><span>92% utilisation</span></div></div>
      <div className="surface rounded-xl p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Inbox flow</h2><Badge tone="blue">5 waiting</Badge></div><div className="space-y-3">{[['Patient messages', 2, 'bg-blue-500'], ['HealthLink results', 7, 'bg-coral-500'], ['Internal notes', 3, 'bg-slate-400']].map(([label, count, colour]) => <div key={label as string}><div className="mb-1 flex justify-between text-[10px]"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-700">{count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${colour}`} style={{ width: `${Number(count) * 10 + 20}%` }} /></div></div>)}</div><button data-testid="button-open-inbox" onClick={() => go('inbox')} className="mt-4 text-[11px] font-medium text-teal-700">Open inbox <ChevronRight size={13} className="ml-1 inline" /></button></div>
      <div className="rounded-xl bg-[#e8f2ed] p-4"><div className="mb-4 flex items-center gap-2"><span className="icon-box icon-teal"><Sparkles size={15} /></span><h2 className="text-sm font-semibold text-slate-800">Síle’s briefing</h2><span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-medium text-teal-800">08:05</span></div><p className="text-[12px] leading-5 text-slate-600">Good morning. I booked 3 appointments overnight, delivered 5 normal results, and found 4 CDM recalls that need a nudge.</p><div className="mt-4 flex items-center gap-2"><Button size="sm" variant="primary" onClick={() => go('sile')}>Open Síle</Button><button data-testid="button-dismiss-briefing" onClick={() => toast('Briefing marked as read')} className="text-[11px] text-slate-500 hover:text-slate-700">Dismiss</button></div></div>
    </div>
  </div>;
}

function Toolbar({ search, setSearch, filterLabel = 'Filter', action, actionLabel = 'Add new' }: { search: string; setSearch: (value: string) => void; filterLabel?: string; action?: () => void; actionLabel?: string }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2"><div className="relative min-w-[190px] flex-1 sm:max-w-[300px]"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input data-testid="input-page-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" /></div><button data-testid="button-filter" className="button button-secondary button-sm"><SlidersHorizontal size={14} />{filterLabel}</button>{action && <Button size="sm" icon={Plus} onClick={action} variant="primary">{actionLabel}</Button>}</div>;
}

function TableShell({ children }: { children: ReactNode }) { return <div className="surface overflow-x-auto rounded-xl"><table className="data-table w-full min-w-[720px]">{children}</table></div>; }
function TableHead({ children }: { children: ReactNode }) { return <thead><tr>{children}</tr></thead>; }
function Th({ children }: { children?: ReactNode }) { return <th>{children}</th>; }

function CalendarPage({ toast }: { toast: (message: string) => void }) {
  const [view, setView] = useState('Day');
  return <div className="fade-in"><SectionTitle eyebrow="Friday 13 September 2024" title="Calendar" description="All clinicians · 34 appointments" action={<div className="flex gap-2"><Button size="sm" icon={Plus} onClick={() => toast('New appointment flow opened')}>New appointment</Button><Button size="sm" variant="secondary" onClick={() => toast('Today selected')}>Today</Button></div>} /><div className="surface rounded-xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-1">{['Day', 'Week', 'Month'].map((item) => <button key={item} data-testid={`button-calendar-${item.toLowerCase()}`} onClick={() => setView(item)} className={`rounded-md px-3 py-1.5 text-[11px] ${view === item ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400 hover:bg-slate-50'}`}>{item}</button>)}</div><div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="h-2 w-2 rounded-full bg-teal-500" /> Dr Murphy <span className="ml-2 h-2 w-2 rounded-full bg-blue-500" /> Dr O’Neill <span className="ml-2 h-2 w-2 rounded-full bg-purple-500" /> Aisling</div></div><div className="grid grid-cols-[58px_1fr_1fr_1fr] divide-x divide-slate-100"><div className="pt-12">{['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'].map((time) => <div key={time} className="h-[76px] border-b border-slate-100 pr-2 text-right font-mono text-[9px] text-slate-400">{time}</div>)}</div>{['Dr Murphy', 'Dr O’Neill', 'Aisling'].map((clinician, column) => <div key={clinician}><div className="h-12 border-b border-slate-100 px-3 pt-3 text-[11px] font-semibold text-slate-700">{clinician}</div><div className="relative">{appointments.filter((_, i) => i % 3 === column || column === 0 && i === 4).map((apt, index) => <button key={apt.time} data-testid={`calendar-slot-${column}-${index}`} onClick={() => toast(`${apt.patient}: appointment opened`)} className={`calendar-event calendar-${apt.colour}`} style={{ top: `${index * 82 + 12}px` }}><span className="font-mono text-[9px]">{apt.time}</span><span className="mt-0.5 block truncate text-[10px] font-semibold">{apt.patient}</span><span className="mt-0.5 block truncate text-[9px] opacity-70">{apt.type}</span></button>)}{[0, 1, 2, 3, 4, 5].map((line) => <div key={line} className="h-[76px] border-b border-slate-100" />)}</div></div>)}</div></div></div>;
}

function HealthLinkPage({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState('All (7)');
  const [search, setSearch] = useState('');
  const rows = healthlinkRows.filter((row) => !search || `${row.patient} ${row.preview}`.toLowerCase().includes(search.toLowerCase())).filter((row) => tab === 'All (7)' || (tab.startsWith('Lab') && row.type === 'Lab result') || (tab.startsWith('Discharge') && row.type === 'Discharge') || (tab.startsWith('Referral') && row.type === 'Referral ack'));
  return <div className="fade-in"><SectionTitle eyebrow="Connected · Last sync 2 min ago" title="HealthLink" description="Incoming results, discharges, referrals and clinical correspondence" action={<Button size="sm" icon={RefreshCw} onClick={() => toast('HealthLink sync complete')}>Sync now</Button>} /><div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">{['All (7)', 'Lab results (3)', 'Discharges (1)', 'Referrals & imaging (2)'].map((item) => <button key={item} onClick={() => setTab(item)} data-testid={`tab-healthlink-${item.split(' ')[0].toLowerCase()}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-[11px] ${tab === item ? 'border-teal-600 font-medium text-teal-800' : 'border-transparent text-slate-400'}`}>{item}</button>)}</div><Toolbar search={search} setSearch={setSearch} filterLabel="Type & status" action={() => toast('HealthLink import panel opened')} actionLabel="Import file" /><TableShell><TableHead><Th>Type</Th><Th>Patient</Th><Th>Preview</Th><Th>From</Th><Th>Time</Th><Th>Status</Th><Th /></TableHead><tbody>{rows.map((row, index) => { const Icon = iconMap[row.icon]; return <tr key={row.patient + row.time} data-testid={`row-healthlink-${index}`}><td><Badge tone={row.tone}><Icon size={11} />{row.type}</Badge></td><td><div className="flex items-center gap-2"><Avatar name={row.patient} size="sm" tone={row.tone} /><span className="font-semibold text-slate-700">{row.patient}</span></div></td><td className="max-w-[330px] truncate text-slate-500">{row.preview}</td><td className="text-slate-400">{row.from}</td><td className="font-mono text-[10px] text-slate-400">{row.time}</td><td><Badge tone={row.tone}>{row.status}</Badge></td><td><button data-testid={`button-review-healthlink-${index}`} onClick={() => toast(`${row.patient}: result opened for review`)} className="button button-ghost button-sm">Review <ChevronRight size={13} /></button></td></tr>; })}</tbody></TableShell>{rows.length === 0 && <EmptyState title="No matching HealthLink items" detail="Try a different patient, result type or status." />}</div>;
}

function InboxPage({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState('All (5)');
  const [search, setSearch] = useState('');
  const [handled, setHandled] = useState<string[]>([]);
  const items = [
    { id: 'm1', title: 'Aoife Murphy — Repeat Rx request', icon: MessageCircle, tone: 'blue', text: '“Can I get a repeat for my inhaler?” Via MyCúram app.', tag: 'Patient', action: 'Reply' },
    { id: 'm2', title: 'Séamus Walsh — Referral letter draft', icon: Sparkles, tone: 'teal', text: 'Síle drafted referral to Mater Cardiology. Ready for review.', tag: 'Síle draft', action: 'Review' },
    { id: 'm3', title: 'Boots Pharmacy — Metformin query', icon: Mail, tone: 'purple', text: '“Confirming dose change to 1g BD?” Via Healthmail.', tag: 'Healthmail', action: 'Reply' },
    { id: 'm4', title: 'Conor Ryan — Reschedule request', icon: MessageCircle, tone: 'amber', text: '“Need to reschedule Thursday.” Unassigned.', tag: 'Unassigned', action: 'Assign' },
    { id: 'm5', title: 'Nurse Aisling — CDM query', icon: Users, tone: 'slate', text: '“Should I repeat HbA1c for Mary O’Brien at her CDM review?” Internal.', tag: 'Internal', action: 'Reply' },
  ].filter((item) => !handled.includes(item.id)).filter((item) => !search || `${item.title} ${item.text}`.toLowerCase().includes(search.toLowerCase())).filter((item) => tab === 'All (5)' || (tab.includes('Patient') && item.tag === 'Patient') || (tab.includes('Healthmail') && item.tag === 'Healthmail') || (tab.includes('Síle') && item.tag === 'Síle draft') || (tab.includes('Internal') && item.tag === 'Internal'));
  return <div className="fade-in"><SectionTitle eyebrow="5 items waiting" title="Inbox" description="One calm queue for every conversation that needs a human." action={<Button size="sm" icon={Plus} onClick={() => toast('New message composer opened')}>New message</Button>} /><div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">{['All (5)', 'Patient messages (2)', 'Healthmail (1)', 'Síle drafts (1)', 'Internal (1)'].map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-[11px] ${tab === item ? 'border-teal-600 font-medium text-teal-800' : 'border-transparent text-slate-400'}`}>{item}</button>)}</div><Toolbar search={search} setSearch={setSearch} filterLabel="Assignee" /><div className="surface divide-y divide-slate-100 overflow-hidden rounded-xl">{items.map((item, index) => <div key={item.id} data-testid={`row-message-${item.id}`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-slate-50"><span className={`icon-box icon-${item.tone}`}><item.icon size={16} /></span><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-700">{item.title}</span><Badge tone={item.tone}>{item.tag}</Badge></div><p className="truncate text-[11px] text-slate-500">{item.text}</p><span className="mt-1 block text-[10px] text-slate-400">{index + 8}:4{index} · Received today</span></div><Button size="sm" variant={item.tag === 'Síle draft' ? 'primary' : 'secondary'} onClick={() => { setHandled((current) => [...current, item.id]); toast(`${item.title.split(' — ')[0]} marked as handled`); }}>{item.action}</Button><button data-testid={`button-more-message-${item.id}`} onClick={() => toast('More message actions opened')} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button></div>)}</div>{!items.length && <EmptyState title="Inbox is clear" detail="Nothing needs your attention in this view." />}</div>;
}

function PatientsPage({ toast }: { toast: (message: string) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const results = patients.filter((patient) => `${patient.name} ${patient.tag} ${patient.detail}`.toLowerCase().includes(search.toLowerCase()));
  const patient = patients.find((item) => item.id === selected);
  return <div className="fade-in"><SectionTitle eyebrow={`${patients.length} recently active`} title="Patients" description="Find a patient, open their record, and keep the next step moving." action={<Button size="sm" icon={UserPlus} onClick={() => toast('New patient registration opened')}>Register patient</Button>} /><Toolbar search={search} setSearch={setSearch} filterLabel="Filters" action={() => toast('Advanced patient search opened')} actionLabel="Advanced search" /><div className="grid gap-4 lg:grid-cols-[1fr_310px]"><div className="surface overflow-hidden rounded-xl"><div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Patient directory</div><div className="divide-y divide-slate-100">{results.map((patientItem) => <button key={patientItem.id} data-testid={`button-patient-${patientItem.id}`} onClick={() => setSelected(patientItem.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${selected === patientItem.id ? 'bg-teal-50/70' : ''}`}><Avatar name={patientItem.name} tone={patientItem.colour} /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-700">{patientItem.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">{patientItem.detail}</span></span><Badge tone={patientItem.colour}>{patientItem.tag}</Badge><ChevronRight size={15} className="text-slate-300" /></button>)}</div>{!results.length && <EmptyState title="No patients found" detail="Try a name, condition, date of birth or identifier." />}</div>{patient ? <div className="surface rounded-xl p-4 fade-in"><div className="flex items-center gap-3"><Avatar name={patient.name} size="lg" tone={patient.colour} /><div><h2 className="text-sm font-semibold text-slate-800">{patient.name}</h2><p className="mt-1 text-[10px] text-slate-400">{patient.detail}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2">{[['Last contact', '12 Sep 2024'], ['Next review', 'Thu 09:30'], ['Care programme', 'DM2'], ['Preferred contact', 'MyCúram']].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-2.5"><div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-[11px] font-medium text-slate-700">{value}</div></div>)}</div><div className="mt-4 space-y-2"><Button size="sm" variant="primary" onClick={() => toast(`${patient.name} record opened`)} testId="button-open-patient-record">Open patient record</Button><Button size="sm" variant="secondary" onClick={() => toast('Appointment booking opened')} testId="button-book-patient">Book appointment</Button></div></div> : <div className="surface flex min-h-[245px] items-center justify-center rounded-xl p-6 text-center"><div><div className="mx-auto icon-box icon-teal"><Users size={18} /></div><h2 className="mt-3 text-sm font-semibold text-slate-700">Select a patient</h2><p className="mt-1 max-w-[220px] text-[11px] leading-5 text-slate-400">Choose someone from the directory to see their care snapshot.</p></div></div>}</div></div>;
}

function PrescriptionsPage({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState(rxRows);
  return <div className="fade-in"><SectionTitle eyebrow="6 requests pending" title="Prescriptions" description="Review repeat requests and send safely through Healthmail." action={<Button size="sm" icon={Pill} onClick={() => toast('New prescription composer opened')}>New prescription</Button>} /><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Pending review" value="6" detail="Oldest request 2h ago" icon={Clock3} tone="amber" /><MetricCard label="Sent today" value="18" detail="All via Healthmail" icon={Send} tone="teal" /><MetricCard label="Controlled drugs" value="2" detail="Require second check" icon={ShieldCheck} tone="coral" /></div><div className="mt-4"><div className="mb-3 flex items-center justify-between"><div className="flex gap-1">{['Pending (6)', 'Active medications', 'History', 'Controlled drugs'].map((item, index) => <button key={item} className={`rounded-md px-3 py-1.5 text-[11px] ${index === 0 ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400 hover:bg-slate-100'}`}>{item}</button>)}</div><button data-testid="button-prescription-filter" onClick={() => toast('Prescription filters opened')} className="button button-ghost button-sm"><ListFilter size={14} />Filter</button></div><TableShell><TableHead><Th>Patient</Th><Th>Medication</Th><Th>Via</Th><Th>Date</Th><Th>Status</Th><Th /></TableHead><tbody>{rows.map((row, index) => <tr key={row.patient} data-testid={`row-prescription-${index}`}><td><div className="flex items-center gap-2"><Avatar name={row.patient} size="sm" tone="blue" /><span className="font-semibold text-slate-700">{row.patient}</span></div></td><td className="font-medium text-slate-600">{row.medicine}</td><td className="text-slate-400">{row.via}</td><td className="text-slate-400">{row.date}</td><td><Badge tone={row.status === 'Pending' || row.status === 'New Rx' ? 'amber' : 'teal'}>{row.status}</Badge></td><td>{row.status === 'Pending' || row.status === 'New Rx' ? <Button size="sm" variant="primary" onClick={() => { setRows((current) => current.filter((item) => item.patient !== row.patient)); toast(`${row.medicine} approved for ${row.patient}`); }}>{row.action}</Button> : <span className="text-[10px] font-medium text-teal-700">Healthmail sent</span>}</td></tr>)}</tbody></TableShell>{!rows.length && <EmptyState title="Prescription queue is clear" detail="New repeat requests will appear here." action={<Button size="sm" onClick={() => toast('Prescription composer opened')}>Write a prescription</Button>} />}</div></div>;
}

function CdmPage({ toast }: { toast: (message: string) => void }) {
  const [tab, setTab] = useState('Reviews due (38)');
  const cdmRows = [{ name: 'Ciarán Doyle', condition: 'DM2', last: '2 Mar', status: '6mo overdue', booked: 'Thu 09:30', recall: 'Síle call', tone: 'coral' }, { name: "Mary O'Brien", condition: 'DM2, AF', last: '12 Aug', status: 'Due', booked: '—', recall: '—', tone: 'amber' }, { name: 'Tom Brennan', condition: 'IHD', last: '20 Jul', status: 'Due', booked: '—', recall: 'SMS sent', tone: 'amber' }, { name: 'John Kavanagh', condition: 'HTN', last: '9 Jun', status: 'Due', booked: '—', recall: 'Not contacted', tone: 'coral' }];
  return <div className="fade-in"><SectionTitle eyebrow="Population health" title="CDM programme" description="Keep long-term condition reviews visible, timely and claim-ready." action={<Button size="sm" icon={CalendarPlus} onClick={() => toast('CDM recall booking opened')}>Book recall</Button>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Enrolled" value="412" detail="87% of eligible" icon={Users} tone="purple" /><MetricCard label="Due this month" value="38" detail="4 overdue" icon={Clock3} tone="amber" /><MetricCard label="Completed" value="24" detail="This month" icon={CheckCircle2} tone="teal" /><MetricCard label="CDM revenue" value="€6,400" detail="Claims this month" icon={CircleDollarSign} tone="teal" /><MetricCard label="HbA1c average" value="6.9%" detail="Down 0.2% six months" icon={Activity} tone="blue" /></div><div className="mt-5 flex gap-1 border-b border-slate-200">{['Reviews due (38)', 'By condition', 'Completed', 'CDR submissions'].map((item) => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-3 py-2 text-[11px] ${tab === item ? 'border-teal-600 font-medium text-teal-800' : 'border-transparent text-slate-400'}`}>{item}</button>)}</div>{tab === 'Reviews due (38)' && <div className="mt-4"><TableShell><TableHead><Th>Patient</Th><Th>Condition</Th><Th>Last review</Th><Th>Status</Th><Th>Booked</Th><Th>Recall</Th><Th /></TableHead><tbody>{cdmRows.map((row, index) => <tr key={row.name}><td><div className="flex items-center gap-2"><Avatar name={row.name} size="sm" tone="purple" /><span className="font-semibold text-slate-700">{row.name}</span></div></td><td><Badge tone="purple">{row.condition}</Badge></td><td className="text-slate-400">{row.last}</td><td><Badge tone={row.tone}>{row.status}</Badge></td><td className="text-[10px] text-teal-700">{row.booked}</td><td><Badge tone={row.recall === '—' ? 'slate' : row.tone === 'coral' ? 'coral' : 'teal'}>{row.recall}</Badge></td><td><Button size="sm" onClick={() => toast(`${row.name}: review actions opened`)}>{row.booked === '—' ? 'Contact' : 'Open'}</Button></td></tr>)}</tbody></TableShell></div>}{tab !== 'Reviews due (38)' && <div className="surface mt-4 rounded-xl p-6"><div className="grid gap-3 sm:grid-cols-2">{['Type 2 diabetes · 186 enrolled · 14 due', 'COPD · 78 enrolled · 8 due', 'Asthma · 64 enrolled · 6 due', 'Heart failure · 32 enrolled · 4 due', 'IHD · 28 enrolled · 3 due', 'Stroke / TIA · 14 enrolled · 2 due'].map((item) => <button key={item} onClick={() => toast(`${item.split(' · ')[0]} cohort opened`)} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-left text-xs font-medium text-slate-700 hover:border-teal-200"><span>{item}</span><ChevronRight size={14} className="text-slate-300" /></button>)}</div></div>}</div>;
}

function GenericPage({ id, toast }: { id: ModuleId; toast: (message: string) => void }) {
  const config: Record<string, { eyebrow: string; title: string; description: string; tabs: string[]; icon: LucideIcon; items: { title: string; detail: string; tag?: string; tone?: string; action?: string }[] }> = {
    referrals: { eyebrow: 'Clinical coordination', title: 'Referrals', description: 'Track outgoing referrals and incoming reports without losing the thread.', tabs: ['Active (5)', 'Síle drafts (1)', 'Incoming reports', 'History'], icon: ArrowUpRight, items: [{ title: "Mary O'Brien · Dietetics", detail: 'Community service · Sent 13 Sep · expected 2–3 weeks', tag: 'Sent', tone: 'blue', action: 'Open' }, { title: 'Séamus Walsh · Cardiology', detail: 'Mater Hospital · Sent 12 Sep · waiting list 4–6 weeks', tag: 'Acknowledged', tone: 'teal', action: 'Open' }, { title: 'Eileen Doyle · Heart failure clinic', detail: 'Beaumont · Discharge follow-up required', tag: 'Action needed', tone: 'coral', action: 'Review' }, { title: 'Tom Brennan · Anticoagulation', detail: 'Mater Hospital · Routine referral', tag: 'Draft', tone: 'amber', action: 'Edit' }] },
    billing: { eyebrow: 'Practice operations', title: 'Billing', description: 'Know what has been billed, paid, claimed and needs a nudge.', tabs: ['Overview', 'PCRS claims', 'Insurer claims', 'Payments', 'Reconciliation'], icon: Receipt, items: [{ title: '€5,920 · PCRS claims submitted', detail: '148 claims this month · 142 paid · 3 processing · 3 rejected', tag: 'On track', tone: 'teal', action: 'View' }, { title: '3 rejected claims need action', detail: 'Medical card expired (2), duplicate (1)', tag: 'Fix', tone: 'coral', action: 'Fix' }, { title: 'Outstanding patient balance · €4,280', detail: 'Down 22% vs last month · Síle collected €680 this week', tag: 'Chase', tone: 'amber', action: 'View' }, { title: 'Stripe payments today · €460', detail: '6 card payments · 2 payment links pending', tag: 'Today', tone: 'blue', action: 'View' }] },
    sile: { eyebrow: 'Your practice co-pilot', title: 'Síle AI', description: 'See what Síle handled, tune her guardrails, and review every call.', tabs: ['Dashboard', 'Configuration', 'Call log'], icon: Sparkles, items: [{ title: '156 appointments booked', detail: '46% of all bookings · average call 1:42', tag: '46%', tone: 'teal', action: 'View' }, { title: '89 normal results delivered', detail: 'Voice calls with SMS fallback where needed', tag: '89', tone: 'teal', action: 'View' }, { title: '34 CDM recalls completed', detail: '28 booked · 82% conversion from outreach', tag: '82%', tone: 'purple', action: 'View' }, { title: '€2,840 collected via reminders', detail: 'Payment links plus a gentle voice follow-up', tag: 'Impact', tone: 'amber', action: 'View' }] },
    insights: { eyebrow: 'Practice intelligence', title: 'Insights', description: 'A clear read on access, care quality and the health of the business.', tabs: ['Practice KPIs', 'CDM analytics', 'Financial', 'Síle impact', 'Clinical audit'], icon: ChartNoAxesCombined, items: [{ title: '487 appointments this month', detail: 'DNA 4.2% · utilisation 92% · average wait 12 min', tag: '92%', tone: 'blue', action: 'View' }, { title: 'Patient growth · +28 this month', detail: '2,847 total patients · GMS 1,923 (68%)', tag: '+28', tone: 'teal', action: 'View' }, { title: 'Revenue · €38,420 this month', detail: 'GMS €22,120 · private €16,300 · up 8% vs August', tag: '↑ 8%', tone: 'teal', action: 'View' }, { title: 'Prescribing audit ready', detail: 'Antibiotic rates · generic percentage · polypharmacy', tag: 'Audit', tone: 'amber', action: 'Generate' }] },
    staff: { eyebrow: 'People & capacity', title: 'Staff & rota', description: 'See who is on, assign sessions, and keep cover safe.', tabs: ['Team (9)', 'Weekly rota', 'Permissions', 'Leave'], icon: UserCog, items: [{ title: 'Dr Sarah Murphy', detail: 'GP Partner · Mon–Fri AM + PM · 1,420 patients', tag: 'Active', tone: 'teal', action: 'Edit' }, { title: "Dr Kevin O'Neill", detail: 'GP Salaried · Mon–Thu AM + PM · 890 patients', tag: 'Active', tone: 'teal', action: 'Edit' }, { title: 'Aisling Brennan', detail: 'Practice Nurse · Mon–Fri AM + PM · CDM: 412', tag: 'Active', tone: 'teal', action: 'Edit' }, { title: 'Claire Dempsey', detail: 'Practice Manager · Mon–Fri 08:00–17:00', tag: 'Active', tone: 'teal', action: 'Edit' }] },
    workflows: { eyebrow: 'Automation', title: 'Workflows', description: 'Let the right thing happen next, with a safe audit trail.', tabs: ['Active (28)', 'Inactive (4)', 'Run history'], icon: GitMerge, items: [{ title: 'Appointment reminder → SMS 48h + 2h', detail: 'If no confirm, Síle call at 24h · 462 runs this month', tag: '462 runs', tone: 'teal', action: 'Edit' }, { title: 'Lab result routing → ordering GP', detail: 'Auto-match, route, flag abnormal, SMS if critical · 89 runs', tag: '89 runs', tone: 'teal', action: 'Edit' }, { title: 'Repeat Rx → queue → approve → Healthmail', detail: 'Patient requests, GP reviews, pharmacy notified · 86 runs', tag: '86 runs', tone: 'teal', action: 'Edit' }, { title: 'Payment reminder → SMS → Síle call', detail: '7-day, 14-day, 21-day escalation · €2,840 collected', tag: '42 runs', tone: 'amber', action: 'Edit' }] },
    settings: { eyebrow: 'Practice controls', title: 'Settings', description: 'Keep the practice configured, connected and compliant.', tabs: ['Practice', 'Integrations', 'Templates', 'Security & GDPR'], icon: Settings, items: [{ title: 'Practice details', detail: 'Name, address, Eircode, phone, hours and PCRS registration', action: 'Edit' }, { title: 'HealthLink', detail: 'Lab results, eReferrals, discharge summaries and CDR submission', tag: 'Connected', tone: 'teal', action: 'Configure' }, { title: 'Healthmail', detail: 'Electronic prescriptions and secure doctor-to-doctor email', tag: 'Connected', tone: 'teal', action: 'Configure' }, { title: 'PCRS', detail: 'GMS panel management, claim submission and card verification', tag: 'Connected', tone: 'teal', action: 'Configure' }, { title: 'Authentication & access', detail: '2FA enforcement, session timeouts and password policy', action: 'Edit' }, { title: 'Audit log', detail: 'HIQA-compliant record of every access, modification and action', action: 'View' }] },
  };
  const page = config[id] || config.insights;
  const [tab, setTab] = useState(page.tabs[0]);
  return <div className="fade-in"><SectionTitle eyebrow={page.eyebrow} title={page.title} description={page.description} action={<Button size="sm" icon={Plus} onClick={() => toast(`${page.title}: create flow opened`)}>Add new</Button>} /><div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">{page.tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-[11px] ${tab === item ? 'border-teal-600 font-medium text-teal-800' : 'border-transparent text-slate-400'}`}>{item}</button>)}</div><div className="surface divide-y divide-slate-100 overflow-hidden rounded-xl">{page.items.map((item, index) => <div key={item.title} data-testid={`row-${id}-${index}`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-slate-50"><span className={`icon-box icon-${item.tone || 'slate'}`}><page.icon size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-700">{item.title}</span>{item.tag && <Badge tone={item.tone || 'slate'}>{item.tag}</Badge>}</div><p className="mt-1 text-[11px] text-slate-500">{item.detail}</p></div><Button size="sm" variant={item.action === 'Fix' || item.action === 'Review' ? 'primary' : 'secondary'} onClick={() => toast(`${item.title}: ${item.action?.toLowerCase() || 'opened'}`)}>{item.action || 'Open'}</Button><button onClick={() => toast('More actions opened')} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button></div>)}</div><div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/40 p-5 text-center"><div className="mx-auto icon-box icon-teal"><page.icon size={17} /></div><p className="mt-2 text-xs font-medium text-slate-600">{tab} is ready to explore</p><p className="mt-1 text-[11px] text-slate-400">Representative data is shown for this frontend workspace.</p></div></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="surface mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl p-6 text-center"><div className="icon-box icon-teal"><Inbox size={18} /></div><h3 className="mt-3 text-sm font-semibold text-slate-700">{title}</h3><p className="mt-1 max-w-[280px] text-[11px] leading-5 text-slate-400">{detail}</p>{action && <div className="mt-3">{action}</div>}</div>; }

function Workspace() {
  const [active, setActive] = useState<ModuleId>('dashboard');
  const [role, setRole] = useState<Role>('gp');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const toast = (message: string) => { setToastMessage(message); window.setTimeout(() => setToastMessage(''), 2600); };
  const go = (id: ModuleId) => setActive(id);
  const content = useMemo(() => {
    if (globalSearch && active === 'dashboard') return <PatientsPage toast={toast} />;
    if (active === 'dashboard') return <Dashboard go={go} toast={toast} />;
    if (active === 'calendar') return <CalendarPage toast={toast} />;
    if (active === 'healthlink') return <HealthLinkPage toast={toast} />;
    if (active === 'inbox') return <InboxPage toast={toast} />;
    if (active === 'patients') return <PatientsPage toast={toast} />;
    if (active === 'prescriptions') return <PrescriptionsPage toast={toast} />;
    if (active === 'cdm') return <CdmPage toast={toast} />;
    return <GenericPage id={active} toast={toast} />;
  }, [active, globalSearch]);
  return <div className="app-shell flex"><Sidebar active={active} setActive={go} role={role} open={drawerOpen} setOpen={setDrawerOpen} /><main className="main-grid min-w-0 flex-1"><Header active={active} role={role} setRole={setRole} setOpen={setDrawerOpen} onSearch={setGlobalSearch} /><div className="mx-auto max-w-[1500px] p-4 md:p-7">{content}</div></main>{toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}</div>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Workspace} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;