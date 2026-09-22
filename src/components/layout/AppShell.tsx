import { useEffect, useState, type ReactNode } from 'react';
import { Redirect, useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { canAccess } from '@/lib/permissions';
import { supabaseConfigured } from '@/lib/supabase';
import { appStore, useAppState, useSessionStaff } from '@/stores/appStore';
import { signOut, useSupabaseAuth } from '@/stores/authSession';
import type { ModuleId } from '@/types/domain';

const pathToModule: Record<string, ModuleId> = {
  '/': 'dashboard',
  '/calendar': 'calendar',
  '/waiting-room': 'calendar',
  '/healthlink': 'healthlink',
  '/inbox': 'inbox',
  '/patients': 'patients',
  '/prescriptions': 'prescriptions',
  '/cdm': 'cdm',
  '/referrals': 'referrals',
  '/billing': 'billing',
  '/sile': 'sile',
  '/insights': 'insights',
  '/staff': 'staff',
  '/workflows': 'workflows',
  '/settings': 'settings',
};

const moduleToPath: Record<ModuleId, string> = {
  dashboard: '/',
  calendar: '/calendar',
  healthlink: '/healthlink',
  inbox: '/inbox',
  patients: '/patients',
  prescriptions: '/prescriptions',
  cdm: '/cdm',
  referrals: '/referrals',
  billing: '/billing',
  sile: '/sile',
  insights: '/insights',
  staff: '/staff',
  workflows: '/workflows',
  settings: '/settings',
};

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();
  const staff = useSessionStaff();
  const auth = useSupabaseAuth();
  const [location, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => appStore.touchSession(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (supabaseConfigured) {
    if (!auth.ready) {
      return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">Connecting to Ireland…</div>;
    }
    if (!auth.userId) return <Redirect to="/login" />;
    if (auth.needsSetup) return <Redirect to="/setup" />;
  } else if (!state.session || Date.now() > state.session.expiresAt) {
    return <Redirect to="/login" />;
  }
  if (!staff) return <Redirect to="/login" />;

  const active: ModuleId = location.startsWith('/patients') ? 'patients' : pathToModule[location] ?? 'dashboard';

  if (!canAccess(staff.role, active) && location !== '/') {
    return <Redirect to="/" />;
  }

  const badges: Partial<Record<ModuleId, number>> = {
    inbox: state.inbox.filter((item) => !item.read).length,
    prescriptions: state.repeatRequests.filter((item) => item.status === 'pending').length,
    healthlink: state.labResults.filter((item) => !item.gpReviewed).length,
  };

  return (
    <div className="app-shell flex">
      <Sidebar
        active={active}
        onNavigate={(id) => setLocation(moduleToPath[id])}
        role={staff.role}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        staff={staff}
        badges={badges}
        onLogout={() => {
          void signOut().then(() => setLocation('/login'));
        }}
      />
      <main className="main-grid min-w-0 flex-1">
        <Header
          active={active}
          staff={staff}
          team={state.staff}
          practiceName={state.practice.name}
          onSwitchStaff={appStore.switchStaff}
          onOpenNav={() => setDrawerOpen(true)}
          onSearch={(value) => {
            if (value) setLocation('/patients');
          }}
        />
        <div className="mx-auto max-w-[1500px] p-4 md:p-7">{children}</div>
      </main>
    </div>
  );
}
