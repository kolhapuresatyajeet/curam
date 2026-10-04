// Test of the sile-tts Edge Function (Phase 3 premium voice).
// 1. No JWT → 401
// 2. Signed-in GP + no ELEVENLABS_API_KEY configured → 503 with a friendly
//    error (client falls back to on-device Kokoro — this is the expected
//    state until the key is pushed to Edge secrets)
// 3. Once the key IS set → binary audio/mpeg response (mp3)
// Creates a throwaway user, then deletes it.
const fs = require('node:fs');

const env = Object.fromEntries(
  fs
    .readFileSync('./.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const PRACTICE_ID = '2cc80916-17e5-4337-a212-9e0d7018531d';
const TEST_EMAIL = `test-sile-tts-${Date.now()}@curam-test.example`;
const TEST_PASSWORD = 'SileTts-4p7q!z';

async function jfetch(url, options = {}) {
  const res = await fetch(url, options);
  return { res, body: await res.json().catch(() => ({})) };
}

(async () => {
  // 1) No JWT → must be rejected
  const anon = await jfetch(`${URL}/functions/v1/sile-tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello' }),
  });
  console.log(`no-jwt check: HTTP ${anon.res.status} ${JSON.stringify(anon.body).slice(0, 120)}`);
  if (anon.res.status !== 401) throw new Error('expected 401 without JWT');

  // 2) Throwaway GP
  const created = await jfetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  }).then((r) => r.body);
  console.log('user created:', created.id);

  try {
    await jfetch(`${URL}/rest/v1/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ practice_id: PRACTICE_ID, user_id: created.id, name: 'Sile TTS Test GP', role: 'gp', email: TEST_EMAIL, active: true }),
    });
    const session = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    }).then((r) => r.body);
    console.log('signed in OK');

    const authed = await fetch(`${URL}/functions/v1/sile-tts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Aoife Byrne is waiting in the room.' }),
    });
    const contentType = authed.headers.get('content-type') ?? '';
    if (contentType.includes('audio/mpeg')) {
      const buf = await authed.arrayBuffer();
      console.log(`premium voice: HTTP ${authed.status} audio/mpeg, ${buf.byteLength} bytes`);
      if (buf.byteLength < 1000) throw new Error('audio suspiciously small');
    } else {
      const body = await authed.json().catch(() => ({}));
      console.log(`premium voice: HTTP ${authed.status} ${contentType || 'no body'} — ${JSON.stringify(body).slice(0, 160)}`);
      if (authed.status !== 503) throw new Error(`unexpected status ${authed.status} — expected 200 audio or 503 no-key`);
      console.log('key not configured yet — client will fall back to Kokoro (expected until ELEVENLABS_API_KEY is set)');
    }
  } finally {
    await jfetch(`${URL}/rest/v1/staff?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
    await jfetch(`${URL}/rest/v1/ai_usage_log?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } }).catch(() => {});
    await fetch(`${URL}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
    console.log('\ncleanup done');
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
