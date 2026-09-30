import { cors, json } from '../_shared/http.ts';

// GDPR data export (Art. 15/20). Returns the signed-in patient's complete
// record as downloadable JSON. Runs under the patient's own RLS identity, so
// it can only ever export the caller's own data.
//
// Staff-triggered exports (on behalf of a patient) come later via a
// staff-authenticated variant if needed.

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Sign in first' }, 401);

  // Use the caller's own JWT — every query below is RLS-scoped to them.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sign in first' }, 401);

  const tables = [
    'patients',
    'appointments',
    'consultations',
    'prescriptions',
    'repeat_rx_requests',
    'lab_results',
    'referrals',
    'cdm_enrolments',
    'cdm_reviews',
    'patient_messages',
    'patient_readings',
    'invoices',
  ] as const;

  const export_: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    generated_for: userData.user.email,
    notice:
      'This file contains all personal data Cúram holds about you, as provided under GDPR Article 15 (access) and Article 20 (portability).',
  };

  try {
    for (const table of tables) {
      const { data, error } = await userClient.from(table).select('*');
      if (error) {
        // Table not readable for this identity (e.g. no patient record) — skip.
        export_[table] = { unavailable: error.message };
      } else {
        export_[table] = data;
      }
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Export failed' }, 500);
  }

  return new Response(JSON.stringify(export_, null, 2), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mycuram-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
