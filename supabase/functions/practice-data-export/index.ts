import { cors, json } from '../_shared/http.ts';

// Staff-side GDPR / SAR export. GP or practice manager only.
//
//  - No params: whole-practice JSON export (every clinical + admin table).
//  - ?patientId=<uuid>: one patient's record as JSON (SAR support).
//  - ?format=csv: patients list as CSV (mail merges, PCRS, switching out).
//
// Every export writes to audit_log (HIQA): who exported what, when.
// The consultations caveat: notes typed in the web app before DB sync was
// added live only in the browser, so exports cover DB-persisted notes.

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// patient_id-scoped tables (each row belongs to one patient).
const PATIENT_TABLES = [
  'patient_conditions',
  'consultations',
  'prescriptions',
  'repeat_rx_requests',
  'lab_results',
  'referrals',
  'cdm_enrolments',
  'cdm_reviews',
  'patient_messages',
  'patient_readings',
  'appointments',
  'invoices',
  'pcrs_claims',
  'sms_log',
  'inbox_messages',
] as const;

const PATIENTS_CSV_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'dob',
  'gender',
  'phone',
  'email',
  'address',
  'pps_number',
  'gms_number',
  'ihi_number',
  'medical_card_type',
  'allergies',
  'created_at',
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const patientId = url.searchParams.get('patientId');
  const format = url.searchParams.get('format') ?? 'json';

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'Sign in first' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

  // Resolve the caller's staff row + practice. Exports are GP/PM only —
  // they are the data controllers' delegates for SARs.
  const { data: staff } = await admin
    .from('staff')
    .select('id, practice_id, role, name')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return json({ error: 'No practice linked to this account' }, 403);
  if (staff.role !== 'gp' && staff.role !== 'pm') {
    return json({ error: 'Data exports are restricted to the GP and practice manager.' }, 403);
  }

  // Whole-practice CSV: patients list.
  if (format === 'csv') {
    const { data: rows, error } = await admin
      .from('patients')
      .select(PATIENTS_CSV_COLUMNS.join(', '))
      .eq('practice_id', staff.practice_id)
      .order('last_name', { ascending: true });
    if (error) return json({ error: error.message }, 500);

    const lines = [PATIENTS_CSV_COLUMNS.join(',')];
    for (const row of rows ?? []) {
      lines.push(PATIENTS_CSV_COLUMNS.map((col) => csvEscape((row as Record<string, unknown>)[col])).join(','));
    }
    await admin.from('audit_log').insert({
      practice_id: staff.practice_id,
      user_id: userData.user.id,
      action: 'practice.patients_csv_exported',
      entity_type: 'practice',
      entity_id: staff.practice_id,
      details_json: { rows: rows?.length ?? 0 },
    });
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="curam-patients-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const export_: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    exported_by: staff.name,
    practice_id: staff.practice_id,
    patient_id: patientId ?? undefined,
    notice: patientId
      ? 'Full record for this patient, provided under GDPR Article 15 (access) / Article 20 (portability). Notes created before database sync may be missing — check the original device.'
      : 'Full practice dataset, provided under GDPR Article 15 (access) / Article 20 (portability). Notes created before database sync may be missing — check the original device.',
  };

  try {
    if (patientId) {
      // Single-patient export: verify the patient belongs to this practice first.
      const { data: patient, error: patientError } = await admin
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .eq('practice_id', staff.practice_id)
        .maybeSingle();
      if (patientError) return json({ error: patientError.message }, 500);
      if (!patient) return json({ error: 'Patient not found in this practice' }, 404);
      export_['patients'] = [patient];

      for (const table of PATIENT_TABLES) {
        const { data, error } = await admin.from(table).select('*').eq('patient_id', patientId);
        if (error) export_[table] = { unavailable: error.message };
        else export_[table] = data;
      }
      await admin.from('audit_log').insert({
        practice_id: staff.practice_id,
        user_id: userData.user.id,
        action: 'patient.record_exported',
        entity_type: 'patient',
        entity_id: patientId,
        patient_id: patientId,
        details_json: { reason: 'SAR / record export (JSON)' },
      });
    } else {
      // Whole-practice export. Patient-scoped tables are filtered to the
      // practice's own patients so no other practice's data can leak in.
      const { data: patientIds, error: idsError } = await admin
        .from('patients')
        .select('id')
        .eq('practice_id', staff.practice_id);
      if (idsError) return json({ error: idsError.message }, 500);
      const ids = (patientIds ?? []).map((row: { id: string }) => row.id);

      const { data: practice } = await admin
        .from('practices')
        .select('id, name, address, eircode, phone, pcrs_reg, healthlink_id, healthmail')
        .eq('id', staff.practice_id)
        .maybeSingle();
      export_['practice'] = practice ?? { unavailable: 'practice row not readable' };
      export_['patients'] = patientIds ? await admin.from('patients').select('*').eq('practice_id', staff.practice_id).then((r: { data: unknown }) => r.data) : [];

      for (const table of PATIENT_TABLES) {
        if (!ids.length) {
          export_[table] = [];
          continue;
        }
        const { data, error } = await admin.from(table).select('*').in('patient_id', ids);
        if (error) export_[table] = { unavailable: error.message };
        else export_[table] = data;
      }
      await admin.from('audit_log').insert({
        practice_id: staff.practice_id,
        user_id: userData.user.id,
        action: 'practice.data_exported',
        entity_type: 'practice',
        entity_id: staff.practice_id,
        details_json: { patients: ids.length, tables: PATIENT_TABLES.length },
      });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Export failed' }, 500);
  }

  return new Response(JSON.stringify(export_, null, 2), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="curam-${patientId ? 'patient-record' : 'practice'}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
