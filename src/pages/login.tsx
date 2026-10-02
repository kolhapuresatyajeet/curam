import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import { AppButton, Field, inputClass } from '@/components/shared/ui';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAppState } from '@/stores/appStore';
import { useSupabaseAuth } from '@/stores/authSession';

export default function LoginPage() {
  const state = useAppState();
  const auth = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (supabaseConfigured && auth.ready && auth.userId && auth.staff) {
    return <Redirect to="/" />;
  }
  if (supabaseConfigured && auth.ready && auth.userId && auth.platformAdmin && !auth.staff) {
    // Platform admin (superadmin) — no staff row; straight to the support console.
    return <Redirect to="/support" />;
  }
  if (supabaseConfigured && auth.ready && auth.needsSetup) {
    return <Redirect to="/setup" />;
  }

  const signInWithPassword = () => {
    setError('');
    setBusy(true);
    void (async () => {
      const { error: pwError } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (pwError) setError(pwError.message);
      // Success: the auth listener hydrates and the redirects above take over.
    })();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f4f1ea] p-6">
      <div className="w-full max-w-md surface rounded-2xl p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="brand-mark">
            <HeartPulse size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800">Cúram</div>
            <div className="text-[11px] text-slate-500">
              {supabaseConfigured ? 'Ireland workspace' : `Sign in to ${state.practice.name}`}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {emailMode ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                signInWithPassword();
              }}
            >
              <Field label="Email">
                <input className={inputClass} type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password">
                <input className={inputClass} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <AppButton type="submit" variant="primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </AppButton>
              <button type="button" className="block text-[11px] text-teal-700" onClick={() => setEmailMode(false)}>
                Use Google instead
              </button>
            </form>
          ) : (
            <>
              <AppButton
                variant="primary"
                disabled={busy}
                testId="button-login"
                onClick={() => {
                  void (async () => {
                    setError('');
                    setBusy(true);
                    const { error: oauthError } = await signInWithGoogle('/');
                    if (oauthError) {
                      setBusy(false);
                      setError(oauthError.message);
                    }
                  })();
                }}
              >
                {busy ? 'Redirecting to Google…' : 'Continue with Google'}
              </AppButton>
              <button type="button" className="block text-[11px] text-slate-500" onClick={() => setEmailMode(true)}>
                Sign in with email &amp; password instead
              </button>
            </>
          )}
          <p className="text-[11px] text-slate-400">Staff sign in with the Google account used at practice setup.</p>
        </div>
        <button type="button" className="mt-4 text-[11px] text-teal-700" onClick={() => setLocation('/setup')}>
          Create a practice
        </button>
      </div>
    </div>
  );
}
