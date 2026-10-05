import { supabase, supabaseConfigured } from '@/lib/supabase';

/** Manual report upload — the zero-install alternative to the HealthLink
 *  bridge. HL7 XML files are filed to labs/inbox exactly like bridge
 *  messages; PDFs and scans land in the inbox as documents. */

export type UploadResult =
  | { ok: true; kind: 'hl7'; parsedType: string; filed: boolean; message: string }
  | { ok: true; kind: 'document'; inboxId: string; message: string };

export async function uploadReport(
  file: File,
  patientId?: string,
  note?: string,
): Promise<{ data?: UploadResult; error?: Error }> {
  if (!supabaseConfigured || !supabase) return { error: new Error('Needs the live (Supabase) deployment') };
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { error: new Error('Sign in first') };

  const form = new FormData();
  form.append('file', file);
  if (patientId) form.append('patientId', patientId);
  if (note) form.append('note', note);

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/report-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: new Error(json.error ?? `Upload failed (HTTP ${res.status})`) };
  return { data: json as UploadResult };
}

/** One-time (60 s) signed URL for a stored attachment. Paths are namespaced
 *  <practice_id>/… and checked server-side against the caller's practice. */
export async function attachmentUrl(path: string): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/report-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', path }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? (json.url as string) : null;
}
