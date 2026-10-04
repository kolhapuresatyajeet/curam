// Discovers the Adamstown practice + staff rows for sample-data seeding.
// Reads .env.local directly so keys never appear in shell commands.
const fs = require('node:fs');

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('./.env.local', `file://${process.cwd()}/`), 'utf8')
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

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  const practices = await get('practices?select=id,name,address,created_at');
  console.log('PRACTICES:', JSON.stringify(practices, null, 2));
  const staff = await get('staff?select=id,practice_id,name,role,email,user_id,active');
  console.log('STAFF:', JSON.stringify(staff, null, 2));
  const patientCounts = await get('patients?select=practice_id,id');
  const counts = {};
  for (const p of patientCounts) counts[p.practice_id] = (counts[p.practice_id] ?? 0) + 1;
  console.log('PATIENT COUNTS BY PRACTICE:', counts);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
