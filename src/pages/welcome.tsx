import { Redirect, useLocation } from 'wouter';
import { AppButton, SectionTitle } from '@/components/shared/ui';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabaseConfigured } from '@/lib/supabase';
import { signOut, useSupabaseAuth } from '@/stores/authSession';

// Shown when a signed-in account has no practice membership and is not a
// platform admin: either they're a new principal GP (create a practice) or
// they're waiting for a staff invite from an existing practice. Roles are
// never self-declared — they come from practice data (invite / setup).

export default function WelcomePage() {
  const [, setLocation] = useLocation();
  const auth = useSupabaseAuth();

  if (supabaseConfigured && auth.ready && auth.staff) return <Redirect to="/" />;
  if (supabaseConfigured && auth.ready && auth.userId && auth.platformAdmin && !auth.staff) return <Redirect to="/support" />;
  if (supabaseConfigured && auth.ready && !auth.userId) return <Redirect to="/login" />;

  return (
    <div className="fade-in mx-auto max-w-xl p-8">
      <SectionTitle eyebrow="Welcome to Cúram" title="How are you joining?" description={auth.email ? `Signed in as ${auth.email}.` : undefined} />
      <div className="grid gap-3">
        <div className="surface space-y-2 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-800">I'm the GP / principal — create a practice</h2>
          <p className="text-[12px] text-slate-600">Set up a new practice on Cúram. You become its first GP and practice administrator, and invite your staff afterwards.</p>
          <AppButton size="sm" variant="primary" onClick={() => setLocation('/setup')}>
            Create a practice
          </AppButton>
        </div>
        <div className="surface space-y-2 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-800">I'm staff — waiting for an invite</h2>
          <p className="text-[12px] text-slate-600">
            Ask your GP or practice manager to invite you from Staff &amp; rota using <strong>exactly this email</strong>
            {auth.email ? ` (${auth.email})` : ''}. The next time you sign in with that account, your practice opens automatically — no password or code needed.
          </p>
          <p className="text-[11px] text-slate-400">
            Signed in with the wrong Google account? Use a different account:
          </p>
          <button
            type="button"
            className="block text-[11px] text-teal-700"
            onClick={() => {
              void signOut().then(() => {
                void signInWithGoogle('/welcome');
              });
            }}
          >
            Switch Google account
          </button>
        </div>
      </div>
    </div>
  );
}
