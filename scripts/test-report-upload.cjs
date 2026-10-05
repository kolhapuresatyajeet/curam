// E2E test of manual report upload (zero-install HealthLink alternative).
// 1. Throwaway practice + GP + patient (IHI match target)
// 2. PDF upload → storage + inbox item with attachment
// 3. HL7 XML upload (ORU lab result) → parsed + filed to lab_results,
//    abnormal flags force delivery_method 'call' (GP callback rule)
// 4. Signed-URL download works for own file, 404 for another practice's path
// 5. Unauthenticated upload rejected
// 6. Cleanup: throwaway rows + storage objects deleted
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
const TS = Date.now().toString(36);
const GP_EMAIL = `test-upload-${TS}@curam-test.example`;
const GP_PASSWORD = 'Upload-6t3k!r';
const IHI = '26101099' + TS.replace(/\D/g, '').padEnd(10, '7').slice(0, 10);

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
  // 1) Throwaway practice + GP + patient
  const practice = await jfetch(`${URL}/rest/v1/practices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name: 'Curam Upload Test (delete me)', address: '1 Test St', phone: '01 000 0000' }),
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
    body: JSON.stringify({ practice_id: practice.id, user_id: created.id, name: 'Upload Test GP', role: 'gp', email: GP_EMAIL, active: true }),
  });
  const gp = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: GP_EMAIL, password: GP_PASSWORD }),
  }).then((r) => r.body);
  check('throwaway GP signed in', Boolean(gp.access_token));
  const auth = { Authorization: `Bearer ${gp.access_token}` };

  const patient = await jfetch(`${URL}/rest/v1/patients`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ practice_id: practice.id, first_name: 'Test', last_name: 'Patient', dob: '1970-01-01', ihi_number: IHI }),
  }).then((r) => r.body?.[0]);
  check('test patient created with IHI', Boolean(patient?.id));

  // 5) Unauthenticated first (before any state pollution)
  const anon = await jfetch(`${URL}/functions/v1/report-upload`, { method: 'POST', body: new FormData() });
  check('unauthenticated upload rejected (401)', anon.res.status === 401);

  // 2) PDF upload
  const pdfForm = new FormData();
  pdfForm.append('file', new Blob([Buffer.from('%PDF-1.4 test discharge letter')], { type: 'application/pdf' }), 'discharge-letter.pdf');
  pdfForm.append('patientId', patient.id);
  pdfForm.append('note', 'Downloaded from hospital portal');
  const pdf = await jfetch(`${URL}/functions/v1/report-upload`, { method: 'POST', headers: auth, body: pdfForm });
  check('PDF uploaded → inbox document', pdf.res.ok && pdf.body.kind === 'document', JSON.stringify(pdf.body).slice(0, 140));

  const inboxRow = await jfetch(`${URL}/rest/v1/inbox_messages?practice_id=eq.${practice.id}&channel=eq.upload&select=id,attachment_path,attachment_name,patient_id`, {
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
  }).then((r) => r.body?.[0]);
  check('inbox item has attachment + patient link', Boolean(inboxRow?.attachment_path?.startsWith(`${practice.id}/`)) && inboxRow?.patient_id === patient.id, JSON.stringify(inboxRow));

  // 3) HL7 XML upload — ORU lab result with an abnormal flag
  const hl7 = `<?xml version="1.0"?><ORU_R01>
    <MSH><MSH.9><MSH.9.1>ORU</MSH.9.1></MSH.9><MSH.10>MSG-${TS}</MSH.10><MSH.4>St Test Hospital</MSH.4></MSH>
    <PID><PID.3>${IHI}</PID.3><PID.5><PID.5.1>Patient</PID.5.1><PID.5.2>Test</PID.5.2></PID.5><PID.7>19700101</PID.7></PID>
    <OBX><OBX.3><OBX.3.2>Haemoglobin</OBX.3.2></OBX.3><OBX.5>9.1</OBX.5><OBX.6>g/dL</OBX.6><OBX.7>13-17</OBX.7><OBX.8>L</OBX.8></OBX>
    <OBX><OBX.3><OBX.3.2>WBC</OBX.3.2></OBX.3><OBX.5>7.2</OBX.5><OBX.6>10^9/L</OBX.6><OBX.7>4-11</OBX.7><OBX.8>N</OBX.8></OBX>
  </ORU_R01>`;
  const hl7Form = new FormData();
  hl7Form.append('file', new Blob([hl7], { type: 'application/xml' }), 'lab-result.xml');
  const xml = await jfetch(`${URL}/functions/v1/report-upload`, { method: 'POST', headers: auth, body: hl7Form });
  check('HL7 XML parsed + filed as ORU', xml.res.ok && xml.body.kind === 'hl7' && xml.body.parsedType === 'ORU', JSON.stringify(xml.body).slice(0, 160));

  const lab = await jfetch(`${URL}/rest/v1/lab_results?patient_id=eq.${patient.id}&select=id,delivery_method,abnormal_flags`, {
    headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
  }).then((r) => r.body?.[0]);
  check('lab filed with GP-callback delivery (abnormal)', lab?.delivery_method === 'call' && lab?.abnormal_flags?.some((f) => f.startsWith('Haemoglobin')), JSON.stringify(lab));

  // 4) Signed URL: own path works, foreign path 404
  const dl = await jfetch(`${URL}/functions/v1/report-upload`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', path: inboxRow.attachment_path }),
  });
  check('signed URL for own file', dl.res.ok && typeof dl.body.url === 'string');
  const dlForeign = await jfetch(`${URL}/functions/v1/report-upload`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', path: '00000000-0000-0000-0000-000000000000/steal.pdf' }),
  });
  check('foreign practice path rejected (404)', dlForeign.res.status === 404);

  // 6) Cleanup
  await jfetch(`${URL}/storage/v1/object/practice-documents/${encodeURIComponent(inboxRow.attachment_path)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON },
  });
  await jfetch(`${URL}/rest/v1/staff?user_id=eq.${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/rest/v1/practices?id=eq.${practice.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  await jfetch(`${URL}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${SRK}`, apikey: ANON } });
  console.log('\nCleanup done (practice cascade removes inbox/lab/audit rows).');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
