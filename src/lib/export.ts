import { getSupabaseConfig, supabase } from '@/lib/supabase';

// Staff-side data export (GDPR Art. 15/20). Calls the practice-data-export
// Edge Function with the signed-in staff JWT; the server restricts exports
// to GPs and practice managers and writes every export to the audit log.

export type ExportResult = { ok: true; filename: string } | { ok: false; error: string };

function download(blob: Blob, filename: string): ExportResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, filename };
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

async function callExport(query: string, fallbackName: string): Promise<ExportResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured in this environment.' };
  const config = getSupabaseConfig();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return { ok: false, error: 'Sign in first.' };

  try {
    const response = await fetch(`${config.url}/functions/v1/practice-data-export${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `Export failed (HTTP ${response.status})` };
    }
    const blob = await response.blob();
    return download(blob, filenameFromDisposition(response.headers.get('Content-Disposition'), fallbackName));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}

export function exportPracticeData(): Promise<ExportResult> {
  const day = new Date().toISOString().slice(0, 10);
  return callExport('', `curam-practice-export-${day}.json`);
}

export function exportPatientsCsv(): Promise<ExportResult> {
  const day = new Date().toISOString().slice(0, 10);
  return callExport('?format=csv', `curam-patients-${day}.csv`);
}

export function exportPatientRecord(patientId: string): Promise<ExportResult> {
  const day = new Date().toISOString().slice(0, 10);
  return callExport(`?patientId=${encodeURIComponent(patientId)}`, `curam-patient-record-${day}.json`);
}

export function exportPatientHistoryCsv(patientId: string): Promise<ExportResult> {
  const day = new Date().toISOString().slice(0, 10);
  return callExport(`?patientId=${encodeURIComponent(patientId)}&format=csv`, `curam-patient-history-${day}.csv`);
}
