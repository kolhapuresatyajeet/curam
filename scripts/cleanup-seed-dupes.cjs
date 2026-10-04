// Removes the duplicate rows created by the second (unguarded) seed run.
const fs = require('node:fs');

const env = Object.fromEntries(
  fs
    .readFileSync('./.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const HEADERS = {
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.VITE_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};

async function del(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}: ${await res.text()}`);
  console.log('DELETED', path.split('?')[0]);
}

(async () => {
  // Run-2 duplicates (run-1 rows kept: 448117e3 appt, e1f719b4 appt, 8d780a86 consult, dce11243 condition)
  await del('waiting_room?id=eq.89044741-412a-4a24-95cb-7e731369c075');
  await del('appointments?id=eq.a70885bb-0148-47b7-b57d-cbd22a8572ca');
  await del('appointments?id=eq.d4710c04-d32b-4d3f-85fd-f1e0e39211f2');
  await del('consultations?id=eq.ccbbc758-e6c2-4bda-b43e-37f67fa5495c');
  await del('patient_conditions?id=eq.bef53f0e-d7af-47e2-8fe9-22e39d476ba7');
  console.log('CLEANUP DONE');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
