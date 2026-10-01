// Cúram — full-loop Healthmail test (test-only, no cloud env changes).
//
// Run:  supabase start            (local stack — migrations apply on boot)
//       CURAM_FULL_LOOP=1 npm run test:email
//
// Proves the whole connect → send-prescription loop against the REAL function
// code without touching production secrets: functions are served locally via
// `supabase functions serve` with tests/email/functions.test.env, where
// HEALTHMAIL_TEST_MODE=true relaxes @healthmail.ie validation to also accept
// @ethereal.email (free fake-SMTP capture provider). The flag exists only in
// that env file — it is never set in Supabase secrets, so the production
// deployment keeps strict validation. All rows are created against the LOCAL
// stack database and deleted afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import nodemailer from 'nodemailer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SERVE_PORT = process.env.CURAM_SERVE_PORT ?? '54321';

function localStackEnv() {
  try {
    const out = execSync('supabase status -o env', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const env = {};
    for (const m of out.matchAll(/^([A-Z_]+)=(.*)$/gm)) env[m[1]] = m[2].trim();
    return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? { url: env.SUPABASE_URL.replace(/\/$/, ''), serviceRole: env.SUPABASE_SERVICE_ROLE_KEY, anon: env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY }
      : null;
  } catch {
    return null; // local stack not running
  }
}

const uid = () => crypto.randomUUID();

test(
  'full loop: connect Healthmail (test domain) → send prescription → captured by Ethereal',
  { skip: process.env.CURAM_FULL_LOOP !== '1' ? 'set CURAM_FULL_LOOP=1 to include' : false },
  async (t) => {
    const stack = localStackEnv();
    if (!stack) {
      t.skip('local Supabase stack not running — start it with `supabase start` (the full loop never touches the cloud project)');
      return;
    }
    const { url, serviceRole } = stack;

    const rest = async (path, { method = 'GET', body, jwt } = {}) => {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${jwt ?? serviceRole}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
      return Array.isArray(data) ? data : [data];
    };

    // --- fixtures: ethereal account + local auth user + DB rows -------------
    const ethereal = await nodemailer.createTestAccount();
    const email = `curam-loop-test-${Date.now()}@example.com`;
    const password = `Loop-${uid()}`;

    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.ok(created.ok, `could not create test auth user: HTTP ${created.status}`);
    const user = (await created.json()).id;

    const practiceId = uid();
    await rest('practices', { method: 'POST', body: { id: practiceId, name: 'TEST Loop Practice' } });
    const [staffRow] = await rest('staff', {
      method: 'POST',
      body: { practice_id: practiceId, user_id: user, name: 'Dr Loop Test', role: 'gp', email },
    });
    const [patient] = await rest('patients', {
      method: 'POST',
      body: {
        practice_id: practiceId,
        first_name: 'Loop',
        last_name: 'Test',
        dob: '1980-01-01',
        pharmacy_healthmail: 'pharmacy@ethereal.email', // accepted only in test mode
      },
    });
    const [rx] = await rest('prescriptions', {
      method: 'POST',
      body: { patient_id: patient.id, staff_id: staffRow.id, drug_name: 'Metformin', dose: '500mg', frequency: 'twice daily', duration_months: 3, status: 'active' },
    });

    t.after(async () => {
      await rest(`prescriptions?id=eq.${rx.id}`, { method: 'DELETE' }).catch(() => {});
      await rest(`patients?id=eq.${patient.id}`, { method: 'DELETE' }).catch(() => {});
      await rest(`staff?id=eq.${staffRow.id}`, { method: 'DELETE' }).catch(() => {});
      await rest(`practices?id=eq.${practiceId}`, { method: 'DELETE' }).catch(() => {});
      await fetch(`${url}/auth/v1/admin/users/${user}`, {
        method: 'DELETE',
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
      }).catch(() => {});
    });

    // --- serve the real functions locally with the test-only env file -------
    const child = spawn('supabase', ['functions', 'serve', '--env-file', 'tests/email/functions.test.env'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serveLog = '';
    child.stdout.on('data', (d) => (serveLog += d));
    child.stderr.on('data', (d) => (serveLog += d));
    t.after(() => child.kill('SIGTERM'));

    const base = `http://127.0.0.1:${SERVE_PORT}/functions/v1`;
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      up = await fetch(`${base}/healthmail-connect`, { method: 'POST', body: '{}' })
        .then((r) => r.status > 0)
        .catch(() => false);
    }
    assert.ok(up, `local functions server did not start:\n${serveLog.slice(-2000)}`);

    // --- sign in as the test GP ---------------------------------------------
    const signin = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: serviceRole, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.ok(signin.ok, `test GP sign-in failed: HTTP ${signin.status}`);
    const jwt = (await signin.json()).access_token;

    // --- connect the prescriber's (Ethereal) Healthmail account -------------
    const connect = await fetch(`${base}/healthmail-connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: ethereal.user, password: ethereal.pass }),
    });
    const connectBody = await connect.json().catch(() => ({}));
    assert.equal(connect.status, 200, `healthmail-connect failed: ${JSON.stringify(connectBody)}`);
    assert.equal(connectBody.ok, true);

    // --- send the prescription ----------------------------------------------
    const send = await fetch(`${base}/send-healthmail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prescriptionId: rx.id }),
    });
    const sendBody = await send.json().catch(() => ({}));
    assert.equal(send.status, 200, `send-healthmail failed: ${JSON.stringify(sendBody)}`);
    assert.equal(sendBody.ok, true);
    assert.equal(sendBody.to, 'pharmacy@ethereal.email');

    // --- DB side effects ------------------------------------------------------
    const [rxAfter] = await rest(`prescriptions?id=eq.${rx.id}&select=healthmail_sent_at,status`);
    assert.ok(rxAfter.healthmail_sent_at, 'prescription should have healthmail_sent_at stamped');
    assert.equal(rxAfter.status, 'active');

    const [staffAfter] = await rest(`staff?id=eq.${staffRow.id}&select=healthmail_address`);
    assert.equal(staffAfter.healthmail_address, ethereal.user);
  },
);
