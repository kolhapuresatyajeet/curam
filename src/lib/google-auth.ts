import { supabase } from '@/lib/supabase';

export async function signInWithGoogle(nextPath: '/setup' | '/' = '/setup') {
  if (!supabase) {
    return { error: new Error('Supabase is not configured') };
  }
  const redirectTo = `${window.location.origin}${nextPath}`;
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });
}
