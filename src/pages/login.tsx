import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import { AppButton } from '@/components/shared/ui';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabaseConfigured } from '@/lib/supabase';
import { useAppState } from '@/stores/appStore';
import { useSupabaseAuth } from '@/stores/authSession';

export default function LoginPage() {
  const state = useAppState();
  const auth = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (supabaseConfigured && auth.ready && auth.userId && auth.staff) {
    return <Redirect to="/" />;
  }
  if (supabaseConfigured && auth.ready && auth.needsSetup) {
    return <Redirect to="/setup" />;
  }

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
          <p className="text-[11px] text-slate-400">Staff sign in with the Google account used at practice setup.</p>
        </div>
        <button type="button" className="mt-4 text-[11px] text-teal-700" onClick={() => setLocation('/setup')}>
          Create a practice
        </button>
      </div>
    </div>
  );
}
