type Admin = any;

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ');

export function googleRedirectUri() {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-oauth-callback`;
}

export function googleAuthUrl(state: string) {
  const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function hmac(message: string) {
  const secret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromB64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export function appOrigin(raw: string | undefined) {
  const fallback = Deno.env.get('PUBLIC_APP_URL') || 'http://localhost:4173';

  const allowed = (origin: string) => {
    if (origin === 'http://localhost:4173' || origin === 'http://127.0.0.1:4173') return true;
    try {
      const published = Deno.env.get('PUBLIC_APP_URL');
      if (published && new URL(published).origin === origin) return true;
    } catch {
      /* ignore */
    }
    try {
      const host = new URL(origin).hostname;
      const https = origin.startsWith('https://');
      return https && (host.endsWith('.vercel.app') || host.endsWith('.vercel.sh'));
    } catch {
      return false;
    }
  };

  try {
    const origin = new URL(raw ?? fallback).origin;
    if (allowed(origin)) return origin;
  } catch {
    /* use fallback */
  }
  try {
    return new URL(fallback).origin;
  } catch {
    return 'http://localhost:4173';
  }
}

export async function signOAuthState(payload: Record<string, string>) {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `${body}.${await hmac(body)}`;
}

export async function readOAuthState(state: string) {
  const decoded = decodeURIComponent(state);
  const cut = decoded.lastIndexOf('.');
  if (cut <= 0) return null;
  const body = decoded.slice(0, cut);
  const sig = decoded.slice(cut + 1);
  if (!body || !sig || (await hmac(body)) !== sig) return null;
  try {
    return JSON.parse(fromB64Url(body)) as { staffId: string; origin: string };
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '',
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  return (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  return (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
}

async function staffAccessToken(admin: Admin, staffId: string) {
  const { data } = await admin.from('staff_google_tokens').select('refresh_token, access_token, expires_at').eq('staff_id', staffId).maybeSingle();
  if (!data?.refresh_token) return null;
  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
    return data.access_token as string;
  }
  const refreshed = await refreshAccessToken(data.refresh_token as string);
  if (!refreshed.access_token) return null;
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3500) * 1000).toISOString();
  await admin.from('staff_google_tokens').update({ access_token: refreshed.access_token, expires_at: expiresAt }).eq('staff_id', staffId);
  return refreshed.access_token;
}

async function googleJson(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : {} };
}

export async function googleEmail(accessToken: string) {
  const { body } = await googleJson(accessToken, 'https://www.googleapis.com/oauth2/v2/userinfo');
  return String(body.email ?? '');
}

export async function ensureCuramCalendar(accessToken: string, staffName: string, existingId?: string | null) {
  const summary = `Cúram — ${staffName}`;
  if (existingId) {
    const existing = await googleJson(accessToken, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(existingId)}`);
    if (existing.ok) return { id: existingId, summary: String(existing.body.summary ?? summary) };
  }
  const listed = await googleJson(accessToken, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const match = (listed.body.items ?? []).find((item: { summary?: string }) => item.summary === summary);
  if (match?.id) return { id: match.id as string, summary };
  const created = await googleJson(accessToken, 'https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary, timeZone: 'Europe/Dublin' }),
  });
  if (!created.ok) throw new Error(created.body.error?.message ?? 'Could not create Google Calendar');
  return { id: created.body.id as string, summary };
}

export async function saveGoogleConnection(
  admin: Admin,
  staffId: string,
  tokens: { refresh_token?: string; access_token?: string; expires_in?: number },
  calendar: { id: string; summary: string },
  email: string,
) {
  if (tokens.refresh_token) {
    await admin.from('staff_google_tokens').upsert(
      {
        staff_id: staffId,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token ?? null,
        expires_at: new Date(Date.now() + (tokens.expires_in ?? 3500) * 1000).toISOString(),
      },
      { onConflict: 'staff_id' },
    );
  } else if (tokens.access_token) {
    await admin.from('staff_google_tokens').update({
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3500) * 1000).toISOString(),
    }).eq('staff_id', staffId);
  }
  await admin.from('staff').update({
    google_email: email,
    google_calendar_id: calendar.id,
    google_calendar_summary: calendar.summary,
  }).eq('id', staffId);
}

export async function disconnectGoogle(admin: Admin, staffId: string) {
  await admin.from('staff_google_tokens').delete().eq('staff_id', staffId);
  await admin.from('staff').update({
    google_email: null,
    google_calendar_id: null,
    google_calendar_summary: null,
  }).eq('id', staffId);
}

export async function syncAppointmentToGoogle(admin: Admin, appointmentId: string) {
  const { data: appointment } = await admin
    .from('appointments')
    .select('id, staff_id, start_time, end_time, type, status, google_event_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment) return;
  const { data: staff } = await admin
    .from('staff')
    .select('id, name, google_calendar_id')
    .eq('id', appointment.staff_id)
    .maybeSingle();
  if (!staff?.google_calendar_id) return;
  const accessToken = await staffAccessToken(admin, staff.id);
  if (!accessToken) return;

  const calendarId = encodeURIComponent(staff.google_calendar_id);
  if (appointment.status === 'cancelled') {
    if (appointment.google_event_id) {
      await googleJson(
        accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(appointment.google_event_id)}`,
        { method: 'DELETE' },
      );
      await admin.from('appointments').update({ google_event_id: null }).eq('id', appointment.id);
    }
    return;
  }

  const event = {
    summary: `Cúram · ${(appointment.type ?? 'appointment').replace('_', ' ')}`,
    description: 'Booked in Cúram. Patient identifiers stay in the Ireland practice record.',
    start: { dateTime: appointment.start_time, timeZone: 'Europe/Dublin' },
    end: { dateTime: appointment.end_time, timeZone: 'Europe/Dublin' },
    transparency: 'opaque',
  };

  if (appointment.google_event_id) {
    const updated = await googleJson(
      accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(appointment.google_event_id)}`,
      { method: 'PUT', body: JSON.stringify(event) },
    );
    if (updated.ok) return;
  }

  const created = await googleJson(
    accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    { method: 'POST', body: JSON.stringify(event) },
  );
  if (created.ok && created.body.id) {
    await admin.from('appointments').update({ google_event_id: created.body.id }).eq('id', appointment.id);
  }
}

export async function googleBusyWindows(admin: Admin, staffId: string, timeMin: string, timeMax: string) {
  const { data: staff } = await admin.from('staff').select('id, google_calendar_id').eq('id', staffId).maybeSingle();
  const accessToken = await staffAccessToken(admin, staffId);
  if (!accessToken) return [] as { start: string; end: string }[];
  const items = [{ id: 'primary' }];
  if (staff?.google_calendar_id) items.push({ id: staff.google_calendar_id });
  const { ok, body } = await googleJson(accessToken, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin, timeMax, timeZone: 'Europe/Dublin', items }),
  });
  if (!ok) return [];
  const busy: { start: string; end: string }[] = [];
  for (const calendar of Object.values(body.calendars ?? {}) as { busy?: { start: string; end: string }[] }[]) {
    busy.push(...(calendar.busy ?? []));
  }
  return busy;
}
