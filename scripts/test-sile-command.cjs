// End-to-end test of the sile-command Edge Function with a throwaway GP user.
// Creates user + staff row in Adamstown, signs in, asks two real questions,
// then deletes everything it created.
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
const TEST_EMAIL = `test-sile-${Date.now()}@curam-test.example`;
const TEST_PASSWORD = 'SileTest-9k2m!x';

async function jfetch(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

(async () => {
  // 1) Create throwaway user (service role)
  const created = await jfetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  });
  console.log('user created:', created.id);

  try {
    // 2) Staff row in Adamstown
    const staff = await jfetch(`${URL}/rest/v1/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ practice_id: PRACTICE_ID, user_id: created.id, name: 'Sile Test GP', role: 'gp', email: TEST_EMAIL, active: true }),
    });
    const staffRow = Array.isArray(staff) ? staff[0] : staff;
    console.log('staff row:', staffRow.id);

    // 3) Sign in
    const session = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    console.log('signed in OK');

    // 4) Ask real questions
    for (const command of [
      'Who is waiting in the waiting room right now?',
      'Has a report arrived for Grace Kelly?',
      'Brief me on Aoife Byrne',
    ]) {
      const result = await jfetch(`${URL}/functions/v1/sile-command`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      console.log(`\nQ: ${command}\nA: ${result.reply}  [tokens in/out: ${result.inputTokens}/${result.outputTokens}]`);
    }
  } finally {
    // 5) Cleanup
    await jfetch(`${URL}/rest/v1/staff?user_id=eq.${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
    });
    await jfetch(`${URL}/rest/v1/audit_log?user_id=eq.${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
    }).catch(() => {});
    await jfetch(`${URL}/rest/v1/ai_usage_log?user_id=eq.${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
    }).catch(() => {});
    await fetch(`${URL}/auth/v1/admin/users/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
    });
    console.log('\ncleanup done');
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
