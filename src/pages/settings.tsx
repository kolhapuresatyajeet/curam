import { useEffect, useState } from 'react';
import { AppButton, Badge, Field, SectionTitle, Tabs, inputClass } from '@/components/shared/ui';
import { connectGoogleCalendar, disconnectGoogleCalendar } from '@/lib/google-calendar';
import { refreshSchedule } from '@/lib/schedule';
import { useSupabaseAuth } from '@/stores/authSession';
import { formatIrishDateTime } from '@/lib/utils';
import { ageFromDob } from '@/lib/utils';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function SettingsPage() {
  const state = useAppState();
  const auth = useSupabaseAuth();
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('google') ? 'Integrations' : 'Practice'));
  const [name, setName] = useState(state.practice.name);
  const [eraseError, setEraseError] = useState('');
  const [googleError, setGoogleError] = useState('');
  const me = state.staff.find((member) => member.id === auth.staff?.id) ?? auth.staff ?? state.staff.find((member) => member.id === state.session?.staffId);
  const googleFlag = new URLSearchParams(window.location.search).get('google');

  useEffect(() => {
    if (googleFlag === 'connected') void refreshSchedule();
    if (googleFlag === 'error') setGoogleError('Google Calendar was not connected. Check the Cloud OAuth client and retry.');
  }, [googleFlag]);

  return (
    <div className="fade-in">
      <SectionTitle title="Settings" description="Practice, integrations, security and GDPR." />
      <Tabs items={['Practice', 'Integrations', 'Security & GDPR', 'Audit log']} value={tab} onChange={setTab} />
      {tab === 'Practice' && (
        <form
          className="surface max-w-lg space-y-3 rounded-xl p-4"
          onSubmit={(e) => {
            e.preventDefault();
            appStore.updatePractice({ name });
          }}
        >
          <Field label="Practice name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="text-[11px] text-slate-500">{state.practice.address} · {state.practice.eircode} · PCRS {state.practice.pcrsReg}</p>
          <AppButton type="submit" size="sm" variant="primary">Save</AppButton>
        </form>
      )}
      {tab === 'Integrations' && (
        <div className="space-y-4">
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <div className="text-sm font-semibold">Google Calendar</div>
            <p className="text-[12px] text-slate-600">
              Each clinician connects their own Google account (same pattern as Carepatron). Cúram creates a secondary calendar named
              {' '}
              <span className="font-medium">Cúram — {me?.name ?? 'your name'}</span>
              {' '}
              and writes diary slots there. Personal Google busy time is treated as unavailable for voice booking. Event titles do not include patient names.
            </p>
            {me?.googleCalendarId ? (
              <>
                <p className="text-xs text-teal-800">Connected as {me.googleEmail} · {me.googleCalendarSummary}</p>
                <AppButton
                  size="sm"
                  onClick={() => {
                    void disconnectGoogleCalendar().then((result) => {
                      if (result.error) setGoogleError(result.error);
                      else void refreshSchedule();
                    });
                  }}
                >
                  Disconnect my calendar
                </AppButton>
              </>
            ) : (
              <AppButton
                size="sm"
                variant="primary"
                onClick={() => {
                  void connectGoogleCalendar().then((result) => {
                    if (result.error) setGoogleError(result.error);
                  });
                }}
              >
                Connect my Google Calendar
              </AppButton>
            )}
            {googleError && <p className="text-xs text-red-600">{googleError}</p>}
            {googleFlag === 'connected' && <p className="text-xs text-teal-700">Google Calendar connected.</p>}
          </div>
          <div className="surface divide-y rounded-xl">
            {state.staff.filter((member) => member.role === 'gp' || member.role === 'nurse').map((member) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3 text-xs">
                <span className="font-semibold">{member.name}</span>
                {member.googleCalendarId ? (
                  <Badge tone="teal">{member.googleCalendarSummary ?? 'Connected'}</Badge>
                ) : (
                  <span className="text-slate-400">Not connected</span>
                )}
              </div>
            ))}
          </div>
          <div className="surface divide-y rounded-xl">
            {[
              ['HealthLink', state.practice.healthlinkId],
              ['Healthmail', state.practice.healthmail],
              ['Stripe Connect', state.practice.stripeAccountId],
              ['PCRS', state.practice.pcrsReg],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3 text-xs">
                <div className="font-semibold">{label}</div>
                <div className="text-slate-500">{value} · credentials stay on the server / vault in production</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'Security & GDPR' && (
        <div className="space-y-4">
          <div className="surface rounded-xl p-4 text-xs text-slate-600">
            <p>2FA (TOTP) will be enforced via Supabase Auth. Session timeout is 30 minutes. Password policy: 12+ characters with mixed case and a digit.</p>
            <p className="mt-2">Retention: 8 years for adults, until age 25 for children. Erasure is blocked inside the retention window.</p>
          </div>
          <AppButton
            size="sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'curam-gdpr-export.json';
              a.click();
            }}
          >
            Export workspace (JSON)
          </AppButton>
          <div>
            <AppButton
              size="sm"
              variant="danger"
              onClick={() => {
                const sample = state.patients[0];
                if (!sample) return;
                const age = ageFromDob(sample.dob);
                const yearsOnFile = (Date.now() - new Date(sample.createdAt).getTime()) / (365 * 86400000);
                if (age >= 18 && yearsOnFile < 8) {
                  setEraseError(`Cannot erase ${patientName(sample)}: adult records retained 8 years.`);
                  return;
                }
                setEraseError('Erasure workflow recorded (demo — record retained).');
              }}
            >
              Test right-to-erasure
            </AppButton>
            {eraseError && <p className="mt-2 text-xs text-amber-700">{eraseError}</p>}
          </div>
          <AppButton size="sm" variant="ghost" onClick={() => appStore.resetDemo()}>
            Reset demo data
          </AppButton>
        </div>
      )}
      {tab === 'Audit log' && (
        <div className="surface max-h-[480px] overflow-auto divide-y rounded-xl">
          {state.auditLog.slice(0, 80).map((entry) => (
            <div key={entry.id} className="px-4 py-2 text-[11px]">
              <span className="font-mono text-slate-400">{formatIrishDateTime(entry.createdAt)}</span> · {entry.action} {entry.entityType} {entry.entityId}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
