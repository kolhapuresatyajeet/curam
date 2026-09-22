import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { initials } from '@/lib/utils';
import type { Tone } from '@/types/domain';

export function Avatar({ name, size = 'md', tone = 'blue' }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: Tone }) {
  return (
    <span data-testid={`avatar-${name.replace(/\s+/g, '-').toLowerCase()}`} className={`avatar avatar-${size} avatar-${tone}`}>
      {initials(name)}
    </span>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function AppButton({
  children,
  variant = 'secondary',
  size = 'md',
  onClick,
  icon: Icon,
  disabled,
  testId,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  onClick?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  testId?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} data-testid={testId} disabled={disabled} onClick={onClick} className={`button button-${variant} button-${size}`}>
      {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={1.8} />}
      {children}
    </button>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.15em] text-teal-700">{eyebrow}</div>}
        <h1 className="text-[21px] font-semibold tracking-[-.03em] text-slate-800">{title}</h1>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'teal',
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
  icon: LucideIcon;
  trend?: string;
}) {
  return (
    <div className="surface surface-lift rounded-xl p-4">
      <div className="mb-3 flex items-start justify-between">
        <span className={`icon-box icon-${tone}`}>
          <Icon size={16} />
        </span>
        {trend && <span className={`text-[10px] font-medium ${trend.startsWith('↓') ? 'text-teal-700' : 'text-slate-500'}`}>{trend}</span>}
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-[23px] font-bold tracking-[-.04em] text-slate-800">{value}</div>
      <div className="mt-1 text-[10px] text-slate-400">{detail}</div>
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="surface mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl p-6 text-center">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-[280px] text-[11px] leading-5 text-slate-400">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="surface overflow-x-auto rounded-xl">
      <table className="data-table w-full min-w-[720px]">{children}</table>
    </div>
  );
}

export function Tabs({ items, value, onChange }: { items: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-[11px] ${value === item ? 'border-teal-600 font-medium text-teal-800' : 'border-transparent text-slate-400'}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';
