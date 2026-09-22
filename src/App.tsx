import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/layout/AppShell';
import { CookieConsent } from '@/components/shared/CookieConsent';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import BillingPage from '@/pages/billing';
import PublicBookingPage from '@/pages/booking';
import CalendarPage from '@/pages/calendar';
import CdmPage from '@/pages/cdm';
import ConsultationPage from '@/pages/consultation';
import DashboardPage from '@/pages/dashboard';
import HealthLinkPage from '@/pages/healthlink';
import InboxPage from '@/pages/inbox';
import InsightsPage from '@/pages/insights';
import LoginPage from '@/pages/login';
import NotFound from '@/pages/not-found';
import PatientRecordPage from '@/pages/patient-record';
import PatientRegisterPage from '@/pages/patient-register';
import PatientsPage from '@/pages/patients';
import PrescriptionsPage from '@/pages/prescriptions';
import ReferralsPage from '@/pages/referrals';
import SettingsPage from '@/pages/settings';
import SetupPage from '@/pages/setup';
import SilePage from '@/pages/sile';
import StaffPage from '@/pages/staff';
import WaitingRoomPage from '@/pages/waiting-room';
import WorkflowsPage from '@/pages/workflows';
import { useAuthListener } from '@/stores/authSession';

const queryClient = new QueryClient();

function Authed({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/setup" component={SetupPage} />
        <Route path="/book">
          <CookieConsent />
          <PublicBookingPage />
        </Route>
        <Route path="/">
          <Authed>
            <DashboardPage />
          </Authed>
        </Route>
        <Route path="/calendar">
          <Authed>
            <CalendarPage />
          </Authed>
        </Route>
        <Route path="/waiting-room">
          <Authed>
            <WaitingRoomPage />
          </Authed>
        </Route>
        <Route path="/healthlink">
          <Authed>
            <HealthLinkPage />
          </Authed>
        </Route>
        <Route path="/inbox">
          <Authed>
            <InboxPage />
          </Authed>
        </Route>
        <Route path="/patients/new">
          <Authed>
            <PatientRegisterPage />
          </Authed>
        </Route>
        <Route path="/patients/:id/consultation">
          <Authed>
            <ConsultationPage />
          </Authed>
        </Route>
        <Route path="/patients/:id">
          <Authed>
            <PatientRecordPage />
          </Authed>
        </Route>
        <Route path="/patients">
          <Authed>
            <PatientsPage />
          </Authed>
        </Route>
        <Route path="/prescriptions">
          <Authed>
            <PrescriptionsPage />
          </Authed>
        </Route>
        <Route path="/cdm">
          <Authed>
            <CdmPage />
          </Authed>
        </Route>
        <Route path="/referrals">
          <Authed>
            <ReferralsPage />
          </Authed>
        </Route>
        <Route path="/billing">
          <Authed>
            <BillingPage />
          </Authed>
        </Route>
        <Route path="/sile">
          <Authed>
            <SilePage />
          </Authed>
        </Route>
        <Route path="/insights">
          <Authed>
            <InsightsPage />
          </Authed>
        </Route>
        <Route path="/staff">
          <Authed>
            <StaffPage />
          </Authed>
        </Route>
        <Route path="/workflows">
          <Authed>
            <WorkflowsPage />
          </Authed>
        </Route>
        <Route path="/settings">
          <Authed>
            <SettingsPage />
          </Authed>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function AuthBoot({ children }: { children: ReactNode }) {
  useAuthListener();
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthBoot>
            <Router />
          </AuthBoot>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
