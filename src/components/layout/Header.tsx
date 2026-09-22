import { useState } from 'react';
import { Bell, Check, ChevronDown, Menu, Search } from 'lucide-react';
import { Avatar } from '@/components/shared/ui';
import { ROLE_LABEL } from '@/lib/permissions';
import type { ModuleId, Staff } from '@/types/domain';

const pageLabels: Record<ModuleId, string> = {
  dashboard: 'Good morning',
  calendar: 'Calendar',
  healthlink: 'HealthLink',
  inbox: 'Inbox',
  patients: 'Patients',
  prescriptions: 'Prescriptions',
  cdm: 'CDM programme',
  referrals: 'Referrals',
  billing: 'Billing',
  sile: 'Síle AI',
  insights: 'Insights',
  staff: 'Staff & rota',
  workflows: 'Workflows',
  settings: 'Settings',
};

export function Header({
  active,
  staff,
  team,
  practiceName,
  onSwitchStaff,
  onOpenNav,
  onSearch,
}: {
  active: ModuleId;
  staff?: Staff;
  team: Staff[];
  practiceName: string;
  onSwitchStaff: (id: string) => void;
  onOpenNav: () => void;
  onSearch: (value: string) => void;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [search, setSearch] = useState('');
  const first = staff?.name.replace(/^Dr\s+/, '').split(' ')[0] ?? '';
  const greeting = active === 'dashboard' && staff ? `Good morning, ${first}` : pageLabels[active];

  return (
    <header className="flex min-h-[76px] items-center gap-3 border-b border-slate-200/80 bg-[#fbfaf7]/90 px-4 backdrop-blur md:px-8">
      <button data-testid="button-open-navigation" aria-label="Open navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={onOpenNav}>
        <Menu size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[19px] font-semibold tracking-[-.025em] text-slate-800">{greeting}</div>
        <div className="hidden text-[11px] text-slate-500 sm:block">{practiceName}</div>
      </div>
      <div className="relative hidden w-[230px] md:block">
        <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          data-testid="input-global-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            onSearch(event.target.value);
          }}
          placeholder="Search patients, actions..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-white/70 pl-9 pr-3 text-xs outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <button data-testid="button-notifications" className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100">
        <Bell size={18} strokeWidth={1.8} />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
      </button>
      {staff && (
        <div className="relative">
          <button data-testid="button-role-switcher" onClick={() => setRoleOpen(!roleOpen)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/75 px-2 py-1.5 text-left transition hover:border-teal-300">
            <Avatar name={staff.name} size="sm" tone="teal" />
            <span className="hidden text-[11px] leading-4 sm:block">
              <span className="block font-medium text-slate-700">{ROLE_LABEL[staff.role]}</span>
              <span className="block text-[10px] text-slate-400">{staff.name.replace('Dr ', '')}</span>
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          {roleOpen && (
            <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Switch workspace view</div>
              {team.map((item) => (
                <button
                  key={item.id}
                  data-testid={`button-role-${item.role}`}
                  onClick={() => {
                    onSwitchStaff(item.id);
                    setRoleOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 ${item.id === staff.id ? 'bg-teal-50' : ''}`}
                >
                  <Avatar name={item.name} size="sm" tone={item.colour} />
                  <span className="flex-1">
                    <span className="block text-xs font-medium text-slate-700">{ROLE_LABEL[item.role]}</span>
                    <span className="block text-[10px] text-slate-400">{item.title}</span>
                  </span>
                  {item.id === staff.id && <Check size={14} className="text-teal-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
