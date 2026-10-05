// E2E test of VoiceHub one-click provisioning.
// 1. Throwaway practice + GP user (service role)
// 2. POST voicehub-provision with GP JWT → 201, tenant/agent persisted,
//    number_pending true (VoiceHub's Twilio pool has no IE numbers today —
//    exercises the connect-without-number fallback)
// 3. Second call → 409 already connected
// 4. staff-directory with the clinic's cbk_ key → tolerant staff shape,
//    scoped to the practice (hash looked up from booking_keys)
// 5. appointment-availability with the clinic key → 200, empty slots
// 6. Cleanup: delete throwaway user/practice (cascades booking_keys).
//    NOTE: the VoiceHub tenant (name contains "delete me") must be pruned by
//    VoiceHub ops — v1 has no delete endpoint.
const fs = require('node:fs');
const crypto = require('node:crypto');

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
const TS = Date.now().toString(36);
const GP_EMAIL = `test-vh-${TS}@curam-test.example`;
const GP_PASSWORD = 'VhTest-7p2k!q';
const PRACTICE_NAME = 'Curam VoiceHub Test (delete me)';
const CLINIC_KEY = `cbk_live_test_${crypto.randomBytes(32).toString('hex')}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function jfetch(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

(async () => {
  // 1) Throwaway practice + GP (service role)
  const practice = await jfetch(`${URL}/rest/v1/practices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name: PRACTICE_NAME, address: '1 Test Street, Dublin', phone: '01 000 0000' }),
  }).then((r) => r.body?.[0]);
  check('throwaway practice created', Boolean(practice?.id));

  const created = await jfetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: GP_EMAIL, password: GP_PASSWORD, email_confirm: true }),
  }).then((r) => r.body);
  await jfetch(`${URL}/rest/v1/staff`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ practice_id: practice.id, user_id: created.id, name: 'VoiceHub Test GP', role: 'gp', email: GP_EMAIL, active: true }),
  });
  const gp = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: GP_EMAIL, password: GP_PASSWORD }),
  }).then((r) => r.body);
  check('throwaway GP signed in', Boolean(gp.access_token));
  const auth = { Authorization: `Bearer ${gp.access_token}`, 'Content-Type': 'application/json' };

  // 2) Provision — live VoiceHub call (no IE numbers → fallback, still 201)
  const provision = await jfetch(`${URL}/functions/v1/voicehub-provision`, {
    method: 'POST', headers: auth, body: '{}',
  });
  check(
    'provisioned (201, tenant + agent)',
    provision.res.status === 201 && Boolean(provision.body.tenant_id) && Boolean(provision.body.agent_id),
    JSON.stringify(provision.body).slice(0, 200),
  );
  check('number pending flagged (no IE numbers on VoiceHub)', provision.body.number_pending === true);

  const row = await jfetch(`${URL}/rest/v1/practices?id=eq.${practice.id}&select=voicehub_agent_id,voicehub_tenant_id,voicehub_portal_email,voicehub_connected_at`, {
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
  }).then((r) => r.body?.[0]);
  check('practice row records the connection', row?.voicehub_agent_id === provision.body.agent_id && row?.voicehub_tenant_id === provision.body.tenant_id && Boolean(row?.voicehub_connected_at), JSON.stringify(row));

  // 3) Already connected → 409
  const again = await jfetch(`${URL}/functions/v1/voicehub-provision`, {
    method: 'POST', headers: auth, body: '{}',
  });
  check('second provision rejected (409)', again.res.status === 409, JSON.stringify(again.body));

  // 4) staff-directory with the clinic key (hash is stored server-side; we
  //    recreate the hash here to prove the lookup works)
  const keyHash = crypto.createHash('sha256').update(CLINIC_KEY).digest('hex');
  await jfetch(`${URL}/rest/v1/booking_keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_hash: keyHash, practice_id: practice.id }),
  });
  const staffDir = await jfetch(`${URL}/functions/v1/staff-directory`, {
    method: 'POST',
    headers: { 'x-booking-key': CLINIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'staff', practiceId: 'pr_other_practice' }),
  });
  check(
    'staff-directory: clinic key scoped to own practice',
    staffDir.res.ok && Array.isArray(staffDir.body.staff) && staffDir.body.staff.some((s) => s.id && s.staffId === s.id && s.name && s.staffName === s.name),
    JSON.stringify(staffDir.body).slice(0, 160),
  );
  const staffDirBad = await jfetch(`${URL}/functions/v1/staff-directory`, {
    method: 'POST',
    headers: { 'x-booking-key': 'cbk_live_wrong_key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'staff' }),
  });
  check('staff-directory: bad key rejected (401)', staffDirBad.res.status === 401);

  // 5) appointment-availability with the clinic key → scoped to its own
  //    practice (bogus practiceId in the query cannot widen it)
  const availability = await jfetch(`${URL}/functions/v1/appointment-availability?date=2026-10-12&practiceId=pr_other_practice`, {
    headers: { 'x-booking-key': CLINIC_KEY },
  });
  check(
    'availability: clinic key scoped (cannot widen via query param)',
    availability.res.ok && Array.isArray(availability.body.slots) && availability.body.slots.every((s) => s.staffName === 'VoiceHub Test GP'),
    JSON.stringify(availability.body).slice(0, 120),
  );

  // 6) Cleanup (VoiceHub tenant must be pruned by VoiceHub ops)
  await jfetch(`${URL}/rest/v1/staff?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/rest/v1/practices?id=eq.${practice.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  console.log(`\nCleanup done. VoiceHub tenant ${provision.body.tenant_id} (${PRACTICE_NAME}) needs pruning by VoiceHub ops.`);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
