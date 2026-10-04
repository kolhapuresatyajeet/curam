// Verifies the seeded Adamstown dataset.
const fs = require('node:fs');
const env = Object.fromEntries(
  fs
    .readFileSync('./.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const HEADERS = {
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.VITE_SUPABASE_ANON_KEY,
};
const PRACTICE_ID = '2cc80916-17e5-4337-a212-9e0d7018531d';

(async () => {
  const get = async (p) => {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${p}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };
  const patients = await get(`patients?select=id,first_name,last_name&practice_id=eq.${PRACTICE_ID}`);
  console.log(`Patients: ${patients.map((p) => `${p.first_name} ${p.last_name}`).join(', ')}`);
  const appts = await get(`appointments?select=id,patient_id,status,start_time&practice_id=eq.${PRACTICE_ID}`);
  for (const a of appts) {
    const p = patients.find((x) => x.id === a.patient_id);
    console.log(`Appointment: ${p ? `${p.first_name} ${p.last_name}` : a.patient_id} — ${a.status} @ ${a.start_time.slice(0, 16)}`);
  }
  const wr = await get(`waiting_room?select=id,appointment_id,arrived_at&called_in_at=is.null`);
  console.log(`Waiting room (uncalled): ${wr.length}`);
  const labs = await get(`lab_results?select=id,patient_id,abnormal_flags,gp_reviewed&patient_id=in.(${patients.map((p) => p.id).join(',')})`);
  for (const l of labs) {
    const p = patients.find((x) => x.id === l.patient_id);
    console.log(`Lab: ${p ? p.first_name : '?'} — flags [${l.abnormal_flags.join(', ')}] reviewed=${l.gp_reviewed}`);
  }
  const consults = await get(`consultations?select=id,patient_id,status&patient_id=in.(${patients.map((p) => p.id).join(',')})`);
  console.log(`Consultations: ${consults.length} (${consults.map((c) => c.status).join(', ')})`);
  const msgs = await get(`inbox_messages?select=id,subject&practice_id=eq.${PRACTICE_ID}`);
  console.log(`Inbox: ${msgs.map((m) => `"${m.subject}"`).join(', ') || '(none)'}`);
  const events = await get(`workflow_events?select=id,event_type&order=created_at.desc&limit=5`);
  console.log(`Recent workflow events: ${events.map((e) => e.event_type).join(', ') || '(none)'}`);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
