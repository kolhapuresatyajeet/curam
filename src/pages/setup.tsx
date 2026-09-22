import { useEffect, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { AppButton, Field, inputClass, SectionTitle } from '@/components/shared/ui';
import { bootstrapPractice } from '@/lib/db';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabaseConfigured } from '@/lib/supabase';
import { appStore } from '@/stores/appStore';
<<<<<<< HEAD
import { refreshAuthSession, useSupabaseAuth } from '@/stores/authSession';
=======
import { useSupabaseAuth } from '@/stores/authSession';
>>>>>>> refs/remotes/origin/main

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const auth = useSupabaseAuth();
  const [practiceName, setPracticeName] = useState('');
  const [address, setAddress] = useState('');
  const [eircode, setEircode] = useState('');
  const [phone, setPhone] = useState('');
  const [staffName, setStaffName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.fullName && !staffName) setStaffName(auth.fullName);
  }, [auth.fullName, staffName]);

  if (supabaseConfigured && auth.ready && auth.staff) {
    return <Redirect to="/" />;
  }

  if (!auth.ready) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">Connecting…</div>;
  }

  if (!auth.userId) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <SectionTitle
          eyebrow="Onboarding"
          title="Practice setup"
          description="Sign in with Google. Your Ireland Auth user is created first; then you add the practice details."
        />
        <div className="surface space-y-4 rounded-xl p-5">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <AppButton
            variant="primary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const { error: oauthError } = await signInWithGoogle('/setup');
                if (oauthError) {
                  setBusy(false);
                  setError(oauthError.message);
                }
              })();
            }}
          >
            {busy ? 'Redirecting to Google…' : 'Continue with Google'}
          </AppButton>
          <button type="button" className="text-[11px] text-teal-700" onClick={() => setLocation('/login')}>
            Already have a practice? Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <SectionTitle
        eyebrow="Signed in with Google"
        title="Practice details"
        description={`${auth.email ?? 'Your Google account'} will be the first GP on this practice.`}
      />
      <form
        className="surface space-y-3 rounded-xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setError('');
            if (!auth.userId) return;
            setBusy(true);
            const result = await bootstrapPractice({
              userId: auth.userId,
              email: auth.email ?? '',
              practiceName,
              address,
              eircode,
              phone,
              staffName: staffName || auth.fullName || 'GP',
              role: 'gp',
            });
            setBusy(false);
            if (result.error || !result.staff) {
              setError(result.error?.message ?? 'Could not create practice.');
              return;
            }
            appStore.upsertStaff(result.staff);
            appStore.login(result.staff.id);
<<<<<<< HEAD
            await refreshAuthSession();
=======
>>>>>>> refs/remotes/origin/main
            setLocation('/');
          })();
        }}
      >
        <Field label="Your name">
          <input className={inputClass} required value={staffName} onChange={(e) => setStaffName(e.target.value)} />
        </Field>
        <Field label="Google email">
          <input className={inputClass} value={auth.email ?? ''} disabled />
        </Field>
        <Field label="Practice name">
          <input className={inputClass} required value={practiceName} onChange={(e) => setPracticeName(e.target.value)} />
        </Field>
        <Field label="Address">
          <input className={inputClass} required value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Eircode">
          <input className={inputClass} required value={eircode} onChange={(e) => setEircode(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <AppButton type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Create practice'}
        </AppButton>
      </form>
    </div>
  );
}
