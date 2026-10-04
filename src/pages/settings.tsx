import { useEffect, useState } from 'react';
import { AppButton, Badge, Field, SectionTitle, Tabs, inputClass } from '@/components/shared/ui';
import { connectGoogleCalendar, disconnectGoogleCalendar } from '@/lib/google-calendar';
import { connectHealthmail } from '@/lib/db';
import { stripeConnectOnboard, stripeConnectStatus } from '@/lib/stripe';
import { refreshSchedule } from '@/lib/schedule';
import { useSupabaseAuth } from '@/stores/authSession';
import { formatIrishDateTime } from '@/lib/utils';
import { ageFromDob } from '@/lib/utils';
import { appStore, useAppState } from '@/stores/appStore';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { patientName } from '@/types/domain';
import { useFeatureFlag } from '@/lib/featureFlags';
import { canManagePractice, canUseHealthmail } from '@/lib/roles';
import { exportPatientsCsv, exportPracticeData } from '@/lib/export';

export default function SettingsPage() {
  const state = useAppState();
  const auth = useSupabaseAuth();
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('google') ? 'Integrations' : 'Practice'));
  const [name, setName] = useState(state.practice.name);
  const [eraseError, setEraseError] = useState('');
  const [erasePatientId, setErasePatientId] = useState('');
  const [eraseStatus, setEraseStatus] = useState<{ canErase: boolean; reason: string } | null>(null);
  const [eraseChecking, setEraseChecking] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [sileChat, setSileChat] = useFeatureFlag('sileChat');
  const [silePremiumVoice, setSilePremiumVoice] = useFeatureFlag('silePremiumVoice');
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
        canManagePractice(me?.role) ? (
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
        ) : (
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <p className="text-[12px] text-slate-600">
              Practice details are managed by the practice's GP or practice manager.
            </p>
            <p className="text-[11px] text-slate-500">{state.practice.name} · {state.practice.address} · {state.practice.eircode}</p>
          </div>
        )
      )}
      {tab === 'Integrations' && (
        <div className="space-y-4">
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <div className="text-sm font-semibold">Healthmail — secure clinical email (optional)</div>
            {canUseHealthmail(me?.role) ? (
              <>
                <p className="text-[12px] text-slate-600">
                  Connect your own @healthmail.ie account to send prescriptions to pharmacies directly from Cúram. Your password is stored
                  encrypted in the Supabase Vault and is never visible to other staff.
                </p>
                <HealthmailForm />
              </>
            ) : (
              <p className="text-[12px] text-slate-600">
                Prescribing staff (GPs and nurses) connect their own @healthmail.ie address here. Ask your GP or practice manager about
                the practice's Healthmail account.
              </p>
            )}
          </div>
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <div className="text-sm font-semibold">Stripe — online payments (optional · practice-wide)</div>
            {canManagePractice(me?.role) ? (
              <>
                <p className="text-[12px] text-slate-600">
                  Practice-level setting — one Stripe account for the whole practice, connected once by the GP or practice manager.
                  Skip this if the practice takes cash or card payments in-room only; those are recorded directly in Billing.
                  You'll be taken to Stripe's secure setup (business details, IBAN, payouts) and returned here. Cúram never sees your
                  Stripe credentials, and payments go straight to the practice's account.
                </p>
                <StripeConnectCard />
              </>
            ) : (
              <p className="text-[12px] text-slate-600">
                Only the practice's GP or practice manager can connect Stripe.{' '}
                {state.practice.stripeAccountId
                  ? 'The practice already has a Stripe account connected.'
                  : 'No Stripe account is connected yet for the practice.'}
              </p>
            )}
          </div>
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <div className="text-sm font-semibold">Síle AI — chat (beta)</div>
            <p className="text-[12px] text-slate-600">
              Shows a “Chat with Síle” bubble in the bottom-right corner for staff. Read-only: Síle answers
              questions using live practice data but never changes records. Each answer uses a small Claude
              API call (~€2–8/month per GP at typical use) and is metered with a monthly cap on the server.
              The scribe and briefing stay on regardless of this switch.
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={sileChat} disabled={!canManagePractice(me?.role)} onChange={(e) => setSileChat(e.target.checked)} />
              Enable Chat with Síle
            </label>
            {!canManagePractice(me?.role) && (
              <p className="text-[11px] text-slate-400">This setting affects the practice's AI spend — only the GP or practice manager can change it.</p>
            )}
          </div>
          <div className="surface max-w-lg space-y-3 rounded-xl p-4">
            <div className="text-sm font-semibold">Síle AI — premium voice (testing)</div>
            <p className="text-[12px] text-slate-600">
              Replaces Síle's on-device voice with a natural-sounding ElevenLabs voice (spoken replies are synthesised
              server-side; the key never reaches the browser). Uses a small per-character fee, metered under the same
              monthly AI cap. Falls back to the on-device voice automatically if the premium service is unavailable.
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={silePremiumVoice} onChange={(e) => setSilePremiumVoice(e.target.checked)} />
              Enable premium voice (ElevenLabs) — testing
            </label>
          </div>
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
            <p className="font-semibold text-slate-800">Account security</p>
            <p className="mt-2">
              2FA (TOTP) is enforced through Supabase Auth — staff are prompted to enrol a device
              at next sign-in. Session timeout is 30 minutes. Password policy: 12+ characters with
              mixed case and a digit (set in the Supabase Auth policy).
            </p>
          </div>

          <div className="surface rounded-xl p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Retention &amp; right to erasure</p>
            <p className="mt-2">
              Adults: 8 years after last recorded activity. Children: until age 25. The check below
              uses the live retention RPC — erasure is blocked while retention applies.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                value={erasePatientId}
                onChange={(e) => {
                  setErasePatientId(e.target.value);
                  setEraseStatus(null);
                }}
              >
                <option value="">Select a patient…</option>
                {state.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patientName(patient)}</option>
                ))}
              </select>
              <AppButton
                size="sm"
                variant="danger"
                disabled={!erasePatientId || eraseChecking}
                onClick={() => {
                  if (!supabaseConfigured || !erasePatientId) return;
                  setEraseChecking(true);
                  setEraseStatus(null);
                  void supabase!
                    .rpc('patient_retention_status', { p_patient_id: erasePatientId })
                    .then(({ data, error }) => {
                      setEraseChecking(false);
                      if (error) setEraseStatus({ canErase: false, reason: error.message });
                      else if (data) {
                        const payload = data as { can_erase: boolean; reason: string };
                        setEraseStatus({ canErase: payload.can_erase, reason: payload.reason });
                      }
                    });
                }}
              >
                {eraseChecking ? 'Checking…' : 'Check erasure eligibility'}
              </AppButton>
            </div>
            {eraseStatus && (
              <p className={`mt-2 font-medium ${eraseStatus.canErase ? 'text-teal-700' : 'text-amber-700'}`}>
                {eraseStatus.canErase
                  ? `Erasure permitted: ${eraseStatus.reason} Contact the DPO to action final deletion (audited).`
                  : `Erasure blocked: ${eraseStatus.reason}`}
              </p>
            )}
          </div>

          <div className="surface rounded-xl p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Data processing register</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li><strong>Supabase (EU — Frankfurt)</strong> — hosting, database, auth, storage. All patient data at rest in the EU.</li>
              <li><strong>Vercel (EU)</strong> — frontend hosting for the staff web app.</li>
              <li><strong>Twilio</strong> — SMS appointment reminders (phone number only).</li>
              <li><strong>Stripe</strong> — payment links and card payments (billing contact details).</li>
              <li><strong>OpenAI / Anthropic (routed via the LiteLLM gateway when configured)</strong> — AI scribe transcription and note structuring. Audio and transcripts are processed for this purpose only and are never used for model training. The LiteLLM gateway must be EU-hosted to preserve data residency.</li>
              <li><strong>Google</strong> — optional clinician calendar sync (appointment times, no clinical data).</li>
              <li><strong>Healthlink / Healthmail (HSE)</strong> — clinical message transport under HSE governance.</li>
            </ul>
          </div>

          <div className="surface rounded-xl p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Personal data breach procedure</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Contain — identify affected system(s) and stop further exposure.</li>
              <li>Assess — establish scope: patients affected, data categories, risk to rights.</li>
              <li>Notify the DPC <strong>within 72 hours</strong> via breach.dpb@dataprotection.ie (unless unlikely to result in a risk).</li>
              <li>Notify affected patients without undue delay where there is high risk.</li>
              <li>Document every breach (even non-notifiable) in the practice breach log.</li>
            </ol>
            <p className="mt-2 border-l-2 border-slate-300 pl-3 italic">
              Template: “We are writing to inform you of a data incident that may have affected
              your personal information. On [date], [description]. The data involved: [categories].
              We have taken the following steps: [actions]. Your rights, including access to your
              data and complaint to the DPC (www.dataprotection.ie), are unaffected. Contact
              [practice contact] with any concerns.”
            </p>
          </div>

          <div className="surface rounded-xl p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Data export (GDPR Art. 15/20 · SAR support)</p>
            <p className="mt-2">
              Download the practice's full dataset, or one patient's complete record (e.g. for a Subject
              Access Request — respond within one month). Every export is recorded in the audit log.
              GP and practice manager only.
            </p>
            {canManagePractice(me?.role) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AppButton
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    void exportPracticeData().then((result) => setExportStatus(result.ok ? `Export downloaded (${result.filename}).` : result.error));
                  }}
                >
                  Export practice data (JSON)
                </AppButton>
                <AppButton
                  size="sm"
                  onClick={() => {
                    void exportPatientsCsv().then((result) => setExportStatus(result.ok ? `Export downloaded (${result.filename}).` : result.error));
                  }}
                >
                  Export patients (CSV)
                </AppButton>
                {exportStatus && <span className="text-teal-700">{exportStatus}</span>}
              </div>
            ) : (
              <p className="mt-2 text-slate-500">Data exports are restricted to the GP and practice manager.</p>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Patients export their own data from MyCúram → Profile → Download my data. Notes created
              before database sync may be missing from server exports — check the original device.
            </p>
          </div>
          {canManagePractice(me?.role) && (
            <AppButton size="sm" variant="ghost" onClick={() => appStore.resetDemo()}>
              Reset demo data
            </AppButton>
          )}
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

function HealthmailForm() {
  const auth = useSupabaseAuth();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const connected = Boolean(auth.staff?.healthmailAddress);

  if (connected) {
    return <p className="text-xs text-teal-700">Connected as {auth.staff?.healthmailAddress}</p>;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setError('');
          setBusy(true);
          const result = await connectHealthmail(address, password);
          setBusy(false);
          if (result.ok) {
            setSaved(true);
            setPassword('');
            setTimeout(() => setSaved(false), 3000);
            window.location.reload();
          } else {
            setError(String(result.payload.error ?? 'Could not connect Healthmail'));
          }
        })();
      }}
    >
      <Field label="Your @healthmail.ie address">
        <input className={inputClass} type="email" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="firstname.surname@healthmail.ie" />
      </Field>
      <Field label="Healthmail password">
        <input className={inputClass} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <AppButton type="submit" size="sm" variant="primary" disabled={busy}>
        {busy ? 'Connecting…' : 'Connect Healthmail'}
      </AppButton>
      {saved && <p className="text-xs text-teal-700">Healthmail connected.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function StripeConnectCard() {
  const [status, setStatus] = useState<{
    connected: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    status?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = () => {
    void stripeConnectStatus().then((s) => setStatus(s));
  };

  useEffect(() => {
    // Returning from Stripe onboarding lands back here with ?stripe=return|refresh.
    const flag = new URLSearchParams(window.location.search).get('stripe');
    if (flag) window.history.replaceState({}, '', window.location.pathname);
    loadStatus();
  }, []);

  const startOnboarding = () => {
    setError('');
    setBusy(true);
    void (async () => {
      const result = await stripeConnectOnboard();
      setBusy(false);
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError(result.error);
      }
    })();
  };

  if (status && status.connected && status.details_submitted) {
    const ready = status.charges_enabled && status.payouts_enabled;
    return (
      <div className="space-y-2">
        <Badge tone={ready ? 'positive' : 'caution'}>
          {ready ? 'Stripe connected' : 'Connected — finishing Stripe checks'}
        </Badge>
        <p className="text-[11px] text-slate-500">
          {ready
            ? 'Online payments are active. Payments go directly to the practice account.'
            : 'The practice still needs to finish some steps in the Stripe dashboard before payments can be taken.'}
        </p>
        {!ready && (
          <AppButton size="sm" variant="secondary" disabled={busy} onClick={startOnboarding}>
            {busy ? 'Opening…' : 'Continue setup'}
          </AppButton>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AppButton size="sm" variant="primary" disabled={busy} onClick={startOnboarding}>
        {busy ? 'Opening Stripe…' : 'Connect with Stripe'}
      </AppButton>
      {status?.connected && !status.details_submitted && (
        <p className="text-[11px] text-amber-700">Setup was started but not finished — click connect to continue.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
