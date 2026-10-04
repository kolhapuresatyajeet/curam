// Seeds a small sample dataset into the Adamstown practice for Síle voice testing.
// Idempotent-ish: skips patients whose (first_name, last_name) already exist.
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
  Prefer: 'return=representation',
};

const PRACTICE_ID = '2cc80916-17e5-4337-a212-9e0d7018531d';
const GP_STAFF_ID = 'd452b4fe-228d-4f09-8d8a-6fe6a7e93c12';

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  const body = await res.json();
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function post(path, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(row),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}: ${JSON.stringify(body)}`);
  return Array.isArray(body) ? body[0] : body;
}

const todayIso = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

(async () => {
  const existing = await get(`patients?select=id,first_name,last_name,dob,medical_card_type&practice_id=eq.${PRACTICE_ID}`);
  console.log('EXISTING ADAMSTOWN PATIENTS:', existing.map((p) => `${p.first_name} ${p.last_name}`).join(', ') || '(none)');

  const want = [
    { first_name: 'Aoife', last_name: 'Byrne', dob: '1985-03-12', gender: 'female', medical_card_type: 'gms', gms_number: '45219T', phone: '087 221 4455', allergies: 'Penicillin', smoking_status: 'never', gdpr_consent: true, sile_consent: true, address: '14 The Crescent, Lucan', eircode: 'K78 X2P1' },
    { first_name: 'Sean', last_name: "O'Malley", dob: '1958-11-02', gender: 'male', medical_card_type: 'none', phone: '086 552 9014', allergies: 'None known', smoking_status: 'ex', gdpr_consent: true, sile_consent: true, address: '3 Brookview, Lucan', eircode: 'K78 Y9R2' },
    { first_name: 'Grace', last_name: 'Kelly', dob: '1970-06-21', gender: 'female', medical_card_type: 'none', phone: '085 774 3321', allergies: 'None known', smoking_status: 'never', gdpr_consent: true, sile_consent: true, address: '27 Elm Castle Ave, Lucan', eircode: 'K78 V8T4' },
  ];

  const patients = {};
  for (const p of want) {
    const hit = existing.find((e) => e.first_name === p.first_name && e.last_name === p.last_name);
    if (hit) {
      patients[p.first_name] = hit;
      console.log(`SKIP existing patient ${p.first_name} ${p.last_name}`);
      continue;
    }
    const created = await post('patients', { ...p, practice_id: PRACTICE_ID });
    patients[p.first_name] = created;
    console.log(`CREATED patient ${p.first_name} ${p.last_name} -> ${created.id}`);
  }

  const ids = { aoife: patients['Aoife'].id, sean: patients['Sean'].id, grace: patients['Grace'].id };

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const [existingConditions, existingAppts, existingConsults] = await Promise.all([
    get(`patient_conditions?select=id,patient_id&patient_id=eq.${ids.aoife}`),
    get(`appointments?select=id,patient_id,start_time&patient_id=in.(${ids.aoife},${ids.sean})&start_time=gte.${todayPrefix}T00:00:00Z`),
    get(`consultations?select=id,patient_id&patient_id=eq.${ids.grace}`),
  ]);

  // Condition + appointment + waiting-room for Aoife (checked in, waiting now)
  if (!existingConditions.length) {
    const cond = await post('patient_conditions', {
      patient_id: ids.aoife,
      condition_code: 'T90',
      condition_name: 'Diabetes non-insulin dependent',
      coding_system: 'icpc2',
      status: 'active',
      diagnosed_date: '2022-04-18',
    });
    console.log('CREATED condition T90 for Aoife ->', cond.id);
  } else {
    console.log('SKIP condition for Aoife (already exists)');
  }

  if (!existingAppts.some((a) => a.patient_id === ids.aoife)) {
    const apptAoife = await post('appointments', {
      practice_id: PRACTICE_ID,
      patient_id: ids.aoife,
      staff_id: GP_STAFF_ID,
      start_time: todayIso(10, 30),
      end_time: todayIso(10, 55),
      type: 'gp-consult',
      status: 'checked_in',
      booked_via: 'reception',
      sile_triage_notes: '',
      reminder_sent: true,
    });
    const wr = await post('waiting_room', {
      appointment_id: apptAoife.id,
      arrived_at: new Date(Date.now() - 11 * 60000).toISOString(),
      wait_minutes: 11,
    });
    console.log('CREATED appointment + waiting-room entry for Aoife ->', apptAoife.id, wr.id);
  } else {
    console.log('SKIP appointment for Aoife (already exists)');
  }

  // Upcoming appointment for Sean (later today)
  if (!existingAppts.some((a) => a.patient_id === ids.sean)) {
    const apptSean = await post('appointments', {
      practice_id: PRACTICE_ID,
      patient_id: ids.sean,
      staff_id: GP_STAFF_ID,
      start_time: todayIso(16, 0),
      end_time: todayIso(16, 15),
      type: 'phone-triage',
      status: 'scheduled',
      booked_via: 'online',
      sile_triage_notes: 'BP review after medication change.',
      reminder_sent: true,
    });
    console.log('CREATED appointment for Sean ->', apptSean.id);
  } else {
    console.log('SKIP appointment for Sean (already exists)');
  }

  // Signed consultation for Grace last week (drives "what did we decide last time")
  if (!existingConsults.length) {
    const consult = await post('consultations', {
      patient_id: ids.grace,
      staff_id: GP_STAFF_ID,
      template_type: 'gp-consult',
      subjective: 'Tiredness and thirst for the past few weeks. No weight loss. Family history of diabetes (mother).',
      objective: 'BP 138/84. BMI 31. Feet intact, no peripheral neuropathy.',
      assessment: 'Impaired fasting glucose — borderline T2DM risk. Hypertension borderline, monitor.',
      plan: 'Repeat fasting glucose and HbA1c. Lifestyle advice given (diet, 30 min walking). Review in 4 weeks.',
      icpc2_codes: ['T90 Diabetes non-insulin dependent', 'K86 Hypertension uncomplicated'],
      ai_scribe_used: false,
      status: 'signed',
      signed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    });
    console.log('CREATED signed consultation for Grace ->', consult.id);
  } else {
    console.log('SKIP consultation for Grace (already exists)');
  }

  // Labs: normal FBC for Aoife (unreviewed), abnormal HbA1c for Grace (unreviewed)
  const existingLabs = await get(`lab_results?select=id,patient_id&patient_id=in.(${ids.aoife},${ids.grace})`);
  if (!existingLabs.some((l) => l.patient_id === ids.aoife)) {
    const labAoife = await post('lab_results', {
      patient_id: ids.aoife,
      staff_id: GP_STAFF_ID,
      source_hospital: 'Midland Regional Hospital Mullingar',
      healthlink_message_id: 'HL-2026-1004-A01',
      results_json: [
        { name: 'Haemoglobin', value: '13.1', range: '12.0-15.5', flag: 'N' },
        { name: 'WCC', value: '6.8', range: '4.0-11.0', flag: 'N' },
        { name: 'Platelets', value: '265', range: '150-400', flag: 'N' },
      ],
      abnormal_flags: [],
      gp_reviewed: false,
      delivery_method: 'none',
      received_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    });
    console.log('CREATED normal lab for Aoife ->', labAoife.id);
  } else {
    console.log('SKIP normal lab for Aoife (already exists)');
  }

  if (!existingLabs.some((l) => l.patient_id === ids.grace)) {
    const labGrace = await post('lab_results', {
      patient_id: ids.grace,
      staff_id: GP_STAFF_ID,
      source_hospital: 'Midland Regional Hospital Mullingar',
      healthlink_message_id: 'HL-2026-1004-B07',
      results_json: [
        { name: 'HbA1c', value: '52', range: '20-41', flag: 'H' },
        { name: 'Fasting glucose', value: '6.8', range: '3.9-5.5', flag: 'H' },
        { name: 'Cholesterol', value: '4.9', range: '<5.0', flag: 'N' },
      ],
      abnormal_flags: ['HbA1c raised', 'Fasting glucose raised'],
      gp_reviewed: false,
      delivery_method: 'none',
      received_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    });
    console.log('CREATED abnormal lab for Grace ->', labGrace.id);
  } else {
    console.log('SKIP abnormal lab for Grace (already exists)');
  }

  // Healthmail-style inbox message from the lab
  const LAB_SUBJECT = 'Results received: Grace Kelly — HbA1c';
  const existingMsgs = await get(`inbox_messages?select=id,subject&practice_id=eq.${PRACTICE_ID}&patient_id=eq.${ids.grace}`);
  if (!existingMsgs.some((m) => m.subject === LAB_SUBJECT)) {
    const msg = await post('inbox_messages', {
      practice_id: PRACTICE_ID,
      channel: 'healthmail',
      from_name: 'Midland Regional Laboratory',
      from_address: 'lab@midlandregional.ie',
      patient_id: ids.grace,
      subject: LAB_SUBJECT,
      body: 'HbA1c 52 mmol/mol (H). Fasting glucose 6.8 mmol/L (H). Please review in Cúram.',
      message_type: 'external',
      read: false,
      urgent: false,
      received_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    });
    console.log('CREATED inbox message ->', msg.id);
  } else {
    console.log('SKIP inbox message (already exists)');
  }

  console.log('\nDONE — dataset ready for Síle voice testing.');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
