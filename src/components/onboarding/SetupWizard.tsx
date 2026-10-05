import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { AppButton, Field, inputClass } from '@/components/shared/ui';
import { appStore, useAppState } from '@/stores/appStore';
import { inviteStaffMember, savePracticeOnboarding } from '@/lib/db';
import { fetchSaasBilling, startCheckout } from '@/lib/saas';
import { ArrowRight, Building2, Check, CreditCard, Mic, Users } from 'lucide-react';

/**
 * Progressive onboarding — the signup form stays minimal (name + practice
 * name), everything else is collected here, one skippable step at a time.
 * The dashboard shows a "finish setting up" card until all steps are done.
 * Nothing clinical is gated on any of this.
 */
const STEPS = [
  { key: 'details', title: 'Practice details', icon: Building2, blurb: 'Address, phone and opening hours — used on prescriptions, referrals and your booking page.' },
  { key: 'voicehub', title: 'AI receptionist (VoiceHub)', icon: Mic, blurb: 'Connect VoiceHub so patient phone calls are answered and bookings flow straight into your diary.' },
  { key: 'billing', title: 'Choose your plan', icon: CreditCard, blurb: '€99/month or €990/year for the whole practice. 14-day free trial — no charge today.' },
  { key: 'team', title: 'Invite your team', icon: Users, blurb: 'Nurses, reception, the practice manager — everyone gets their own login with the right permissions.' },
] as const;

const VOICEHUB_URL = (import.meta.env.VITE_VOICEHUB_URL as string) || 'https://app.voicehub.uk';

export default function SetupWizard() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  const done = state.practice.onboardingDone ?? [];
  const [stepIndex, setStepIndex] = useState(() => {
    const firstUndone = STEPS.findIndex((s) => !done.includes(s.key));
    return firstUndone === -1 ? 0 : firstUndone;
  });
  const step = STEPS[stepIndex];

  const markDone = async (key: (typeof STEPS)[number]['key']) => {
    const next = done.includes(key) ? done : [...done, key];
    appStore.updatePractice({ onboardingDone: next });
    await savePracticeOnboarding(state.practice.id, { onboarding_done: next });
  };

  const goNext = () => {
    if (stepIndex + 1 < STEPS.length) setStepIndex(stepIndex + 1);
    else setLocation('/');
  };

  return (
    <div className="fade-in mx-auto max-w-xl p-8">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center gap-1">
          {STEPS.map((s, index) => (
            <button
              key={s.key}
              type="button"
              aria-label={s.title}
              onClick={() => setStepIndex(index)}
              className={`h-1.5 flex-1 rounded-full transition ${done.includes(s.key) ? 'bg-teal-500' : index === stepIndex ? 'bg-purple-500' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Step {stepIndex + 1} of {STEPS.length} — {STEPS.length - done.length} left after this. Everything here can be
          changed later in Settings.
        </p>
      </div>

      <div className="surface rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className="icon-box icon-purple">
            <step.icon size={16} />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-800">{step.title}</h1>
            <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{step.blurb}</p>
          </div>
        </div>

        <div className="mt-5">
          {step.key === 'details' && <StepDetails onNext={() => { void markDone('details'); goNext(); }} />}
          {step.key === 'voicehub' && <StepVoicehub onDone={() => { void markDone('voicehub'); goNext(); }} />}
          {step.key === 'billing' && <StepBilling onDone={() => { void markDone('billing'); goNext(); }} onSkip={goNext} />}
          {step.key === 'team' && <StepTeam onDone={() => { void markDone('team'); setLocation('/'); }} />}
        </div>
      </div>

      <button type="button" className="mt-4 text-[11px] text-slate-400 hover:text-slate-600" onClick={goNext}>
        Skip for now — I'll finish this later
      </button>
    </div>
  );
}

// ── Step 1: practice details ─────────────────────────────────────────────────

function StepDetails({ onNext }: { onNext: () => void }) {
  const state = useAppState();
  const [address, setAddress] = useState(state.practice.address);
  const [eircode, setEircode] = useState(state.practice.eircode);
  const [phone, setPhone] = useState(state.practice.phone);
  const [hours, setHours] = useState(state.practice.openingHours || 'Mon–Fri 09:00–17:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setBusy(true);
          setError('');
          const { error } = await savePracticeOnboarding(state.practice.id, { address, eircode, phone, opening_hours: hours });
          setBusy(false);
          if (error) return setError(error.message);
          appStore.updatePractice({ address, eircode, phone, openingHours: hours });
          onNext();
        })();
      }}
    >
      <Field label="Practice address">
        <input className={inputClass} required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="14 Cork Street, Dublin 8" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Eircode">
          <input className={inputClass} required value={eircode} onChange={(e) => setEircode(e.target.value)} placeholder="D08 YX21" />
        </Field>
        <Field label="Phone">
          <input className={inputClass} required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 453 2100" />
        </Field>
      </div>
      <Field label="Opening hours">
        <input className={inputClass} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Fri 08:30–18:00" />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <AppButton type="submit" variant="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save and continue'} <ArrowRight size={13} />
      </AppButton>
    </form>
  );
}

// ── Step 2: VoiceHub AI receptionist ────────────────────────────────────────

function StepVoicehub({ onDone }: { onDone: () => void }) {
  const state = useAppState();
  const [agentId, setAgentId] = useState(state.practice.voicehubAgentId);
  const [phone, setPhone] = useState(state.practice.voicehubPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const me = state.staff.find((m) => m.id === state.session?.staffId);

  const signupUrl = useMemo(() => {
    const params = new URLSearchParams({
      practice: state.practice.name,
      address: state.practice.address,
      phone: state.practice.phone,
      email: me?.email ?? '',
      source: 'curam-onboarding',
    });
    return `${VOICEHUB_URL}/signup?${params.toString()}`;
  }, [state.practice.name, state.practice.address, state.practice.phone, me?.email]);

  return (
    <div className="space-y-4">
      <ol className="space-y-2 text-[12px] leading-5 text-slate-600">
        <li>
          1. Open VoiceHub — your practice details are pre-filled:{' '}
          <a href={signupUrl} target="_blank" rel="noreferrer" className="font-medium text-purple-700 underline">
            Set up my AI receptionist ↗
          </a>
        </li>
        <li>2. Pick a phone number and follow the short setup there.</li>
        <li>3. Paste your VoiceHub agent ID and number below — test calls come from the next screen.</li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="VoiceHub agent ID">
          <input className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent_xxxx" />
        </Field>
        <Field label="Receptionist phone number">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 555 1234" />
        </Field>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <AppButton
        variant="primary"
        disabled={busy || !agentId.trim()}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setError('');
            const { error } = await savePracticeOnboarding(state.practice.id, {
              voicehub_agent_id: agentId.trim(),
              voicehub_phone: phone.trim(),
              voicehub_connected_at: new Date().toISOString(),
            });
            setBusy(false);
            if (error) return setError(error.message);
            appStore.updatePractice({ voicehubAgentId: agentId.trim(), voicehubPhone: phone.trim(), voicehubConnectedAt: new Date().toISOString() });
            onDone();
          })();
        }}
      >
        Connect VoiceHub <ArrowRight size={13} />
      </AppButton>
      <p className="text-[11px] text-slate-400">
        When VoiceHub's provisioning API is live, this step becomes one click — the manual link is the fallback until
        then.
      </p>
    </div>
  );
}

// ── Step 3: billing ──────────────────────────────────────────────────────────

function StepBilling({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const state = useAppState();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already on a plan (e.g. came back from checkout)? Mark done automatically.
  useEffect(() => {
    void fetchSaasBilling(state.practice.id).then((b) => {
      if (b.saasStatus !== 'none') {
        setStatus(b.saasStatus);
        void onDone();
      } else {
        setStatus('none');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(plan: 'monthly' | 'yearly') {
    setBusy(true);
    setError('');
    try {
      const result = await startCheckout(plan);
      if (result.url) window.location.href = result.url;
      else if (result.free) onDone();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (status === null) return <p className="text-[12px] text-slate-500">Checking…</p>;
  if (status !== 'none') return <p className="text-[12px] text-teal-700">You're on a plan — nothing more to do here.</p>;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['monthly', 'yearly'] as const).map((plan) => (
          <button
            key={plan}
            type="button"
            onClick={() => void choose(plan)}
            disabled={busy}
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-purple-300 hover:bg-purple-50/50"
          >
            <p className="text-sm font-semibold text-slate-800">{plan === 'monthly' ? 'Monthly' : 'Yearly'}</p>
            <p className="mt-1 text-[19px] font-semibold text-slate-800">
              €{plan === 'monthly' ? '99' : '990'}
              <span className="text-[12px] font-normal text-slate-500">/{plan === 'monthly' ? 'month' : 'year'}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{plan === 'yearly' ? 'Two months free' : 'Cancel anytime · 14-day free trial'}</p>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" className="text-[11px] text-slate-400 hover:text-slate-600" onClick={onSkip}>
        Not now — keep the reminder on the dashboard
      </button>
    </div>
  );
}

// ── Step 4: invite the team ──────────────────────────────────────────────────

function StepTeam({ onDone }: { onDone: () => void }) {
  const state = useAppState();
  const [name, setName] = useState('');
  const [role, setRole] = useState('nurse');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function invite() {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    setError('');
    const { error: inviteError } = await inviteStaffMember({
      practiceId: state.practice.id,
      name: name.trim(),
      role: role as never,
      email: email.trim().toLowerCase(),
    });
    setBusy(false);
    if (inviteError) return setError(inviteError.message);
    setInvited((current) => [...current, `${name.trim()} (${role})`]);
    setName('');
    setEmail('');
  }

  return (
    <div className="space-y-3">
      {invited.length > 0 && (
        <div className="rounded-lg bg-teal-50 px-3 py-2 text-[12px] text-teal-800">
          {invited.map((i) => (
            <p key={i} className="flex items-center gap-1">
              <Check size={12} /> {i} — invite sent
            </p>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Claire Dempsey" />
        </Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="nurse">Nurse</option>
            <option value="pm">Practice manager</option>
            <option value="receptionist">Receptionist</option>
            <option value="gp">GP</option>
            <option value="hca">Healthcare assistant</option>
          </select>
        </Field>
        <Field label="Email">
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="claire@riverside.ie" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AppButton size="sm" onClick={() => void invite()} disabled={busy || !name.trim() || !email.trim()}>
          Send invite
        </AppButton>
        <AppButton size="sm" variant="primary" onClick={onDone} disabled={busy}>
          {invited.length ? 'Done' : 'Skip — nobody to invite yet'} <ArrowRight size={13} />
        </AppButton>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-slate-400">Invites are claimed on first sign-in — the staff member's email must match exactly.</p>
    </div>
  );
}
