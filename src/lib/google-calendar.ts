import { getSupabaseConfig, supabase } from '@/lib/supabase';

async function authedFetch(path: string, init?: RequestInit) {
  if (!supabase) return { ok: false, payload: { error: 'Not configured' } };
  const { url, anonKey } = getSupabaseConfig();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, payload: { error: 'Sign in with Google first' } };
  const response = await fetch(`${url}/functions/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
  return { ok: response.ok, payload };
}

export async function connectGoogleCalendar() {
  const { ok, payload } = await authedFetch('google-calendar-oauth-start', {
    method: 'POST',
    body: JSON.stringify({ origin: window.location.origin }),
  });
  if (!ok || !payload.url) return { error: payload.error ?? 'Could not start Google Calendar' };
  window.location.assign(payload.url);
  return { error: undefined };
}

export async function disconnectGoogleCalendar() {
  const { ok, payload } = await authedFetch('google-calendar-disconnect', { method: 'POST' });
  if (!ok) return { error: payload.error ?? 'Could not disconnect' };
  return { error: undefined };
}

export async function pushAppointmentToGoogle(appointmentId: string) {
  await authedFetch('google-calendar-sync', {
    method: 'POST',
    body: JSON.stringify({ appointmentId }),
  });
}

export async function notifyBookingEmail(appointmentId: string, kind: 'booked' | 'cancelled') {
  await authedFetch('send-booking-email', {
    method: 'POST',
    body: JSON.stringify({ appointmentId, kind }),
  });
}
