import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  GitMerge,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  MoreHorizontal,
  Pill,
  Receipt,
  Settings,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/shared/ui';
import { visibleNav } from '@/lib/permissions';
import type { ModuleId, Role, Staff } from '@/types/domain';

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  healthlink: Link2,
  inbox: Inbox,
  patients: Users,
  prescriptions: Pill,
  cdm: HeartPulse,
  referrals: ArrowUpRight,
  billing: Receipt,
  sile: Sparkles,
  insights: ChartNoAxesCombined,
  staff: UserCog,
  workflows: GitMerge,
  settings: Settings,
};

export function Sidebar({
  active,
  onNavigate,
  role,
  open,
  onClose,
  staff,
  badges,
  onLogout,
}: {
  active: ModuleId;
  onNavigate: (id: ModuleId) => void;
  role: Role;
  open: boolean;
  onClose: () => void;
  staff?: Staff;
  badges: Partial<Record<ModuleId, number>>;
  onLogout: () => void;
}) {
  const groups = visibleNav(role);
  return (
    <>
      {open && <button aria-label="Close navigation" data-testid="button-close-navigation" className="mobile-scrim md:hidden" onClick={onClose} />}
      <aside className={`sidebar sidebar-scroll ${open ? 'mobile-drawer' : 'hidden md:flex'} w-[244px] shrink-0 flex-col overflow-y-auto`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <div className="brand-mark">
            <HeartPulse size={20} strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[17px] font-semibold tracking-[-.02em] text-white">Cúram</div>
            <div className="text-[10px] uppercase tracking-[.16em] text-slate-400">GP management</div>
          </div>
        </div>
        <div className="px-3 py-4">
          {groups.map((group, groupIndex) => (
            <div key={group.label || 'main'} className={groupIndex ? 'mt-5' : ''}>
              {group.label && <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{group.label}</div>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = iconMap[item.icon];
                  const selected = active === item.id;
                  const badge = badges[item.id];
                  return (
                    <button
                      key={item.id}
                      data-testid={`nav-${item.id}`}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                      className={`nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] ${selected ? 'active' : ''}`}
                    >
                      <Icon size={17} strokeWidth={selected ? 2 : 1.7} />
                      <span className="flex-1">{item.label}</span>
                      {badge ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${selected ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'}`}>
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-white/10 p-3">
          <div className="rounded-xl bg-white/[.055] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="pulse-dot h-2 w-2 rounded-full bg-teal-400" />
              <span className="text-[11px] text-slate-300">Practice systems healthy</span>
            </div>
            <div className="text-[10px] leading-4 text-slate-500">Local demo store · HealthLink ready</div>
          </div>
          {staff && (
            <div className="mt-3 flex w-full items-center gap-2 rounded-lg p-2">
              <Avatar name={staff.name} size="sm" tone="teal" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-slate-200">{staff.name}</span>
                <span className="block text-[10px] text-slate-500">{staff.title}</span>
              </span>
              <button type="button" data-testid="button-logout" onClick={onLogout} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Log out">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export { MoreHorizontal };
