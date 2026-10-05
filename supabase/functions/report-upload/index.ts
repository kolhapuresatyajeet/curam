import { cors, json } from '../_shared/http.ts';
import { parseHl7Xml } from '../_shared/hl7-parser.ts';
import { fileMessage } from '../_shared/healthlink-handlers.ts';

// Manual report upload — the zero-install alternative to the HealthLink
// bridge. Staff download a report anywhere (HealthLink web, hospital portal,
// email) and drop the file into Cúram; nothing to install, no bridge keys.
//
//   POST multipart/form-data  { file, patientId?, note? }
//     - .xml/.hl7  → parsed as HL7 v2.4 and filed exactly like a bridge
//                    message (labs / inbox / referral acks)
//     - anything else (PDF, scans, letters) → private storage bucket
//       practice-documents/<practice_id>/… + an inbox item
//   POST JSON { action: 'download', path }  -> { url }   (60 s signed URL)
//
// Auth: staff JWT only — the GP's existing login. Every upload is audit-
// logged (HIQA). Abnormal lab results keep the GP-callback-only rule (shared
// handlers enforce delivery_method 'call').

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'practice-documents';
const MAX_BYTES = 25 * 1024 * 1024;
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

function jsonNoCors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function currentPractice(auth: string) {
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: staff } = await admin
    .from('staff')
    .select('practice_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return null;
  return { admin, practiceId: staff.practice_id as string, userId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const session = await currentPractice(req.headers.get('Authorization') ?? '');
  if (!session) return json({ error: 'Sign in first' }, 401);
  const { admin, practiceId, userId } = session;

  try {
    // ── Signed download URL (path must live in this practice's folder) ──
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      const body = await req.json().catch(() => ({}));
      if (body.action === 'download') {
        const path = String(body.path ?? '');
        if (!path.startsWith(`${practiceId}/`)) return json({ error: 'Not found' }, 404);
        const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
        if (error || !data) return json({ error: 'File not found' }, 404);
        return json({ url: data.signedUrl });
      }
      return json({ error: 'Send multipart/form-data with a file' }, 400);
    }

    // ── Upload ────────────────────────────────────────────────────────────
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return json({ error: 'file required' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'File too large (25 MB limit)' }, 413);
    const patientId = String(form.get('patientId') ?? '') || null;
    const note = String(form.get('note') ?? '');
    const name = file.name || 'report';

    // HL7 XML: file through the same pipeline as bridge messages.
    if (/\.(xml|hl7)$/i.test(name)) {
      const raw = await file.text();
      const msg = parseHl7Xml(raw) as Record<string, any>;
      // HIQA audit row (bridge_agent_id null = manual upload).
      const { data: logged, error: logErr } = await admin
        .from('healthlink_messages')
        .insert({
          practice_id: practiceId,
          direction: 'inbound',
          message_type: String(msg.type ?? 'other').toUpperCase(),
          healthlink_message_id: msg.healthlink_message_id ?? null,
          status: 'received',
          bridge_agent_id: null,
          raw_content: raw.slice(0, 100_000),
        })
        .select('id')
        .single();
      if (logErr) return json({ error: logErr.message }, 500);
      try {
        const type = await fileMessage(practiceId, msg);
        await admin.from('healthlink_messages').update({ status: 'parsed' }).eq('id', logged.id);
        await admin.from('audit_log').insert({
          practice_id: practiceId,
          user_id: userId,
          action: 'upload',
          entity_type: 'healthlink_message',
          entity_id: logged.id,
          patient_id: null,
          details_json: { file: name, parsed_type: type },
        });
        return json({
          ok: true,
          kind: 'hl7',
          parsedType: type,
          filed: type === 'ORU' || type === 'ADT' || type === 'REF',
          message:
            type === 'ORU' ? 'Lab result filed. Abnormal results always go to GP callback, never AI delivery.'
            : type === 'ADT' ? 'Discharge summary filed to the inbox.'
            : type === 'REF' ? 'Referral acknowledgement recorded.'
            : 'Message stored for review (unrecognised HL7 type).',
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await admin.from('healthlink_messages').update({ status: 'error', error: errMsg }).eq('id', logged.id);
        return json({ error: `HL7 message could not be filed: ${errMsg}` }, 422);
      }
    }

    // Any other document: private storage + inbox item.
    const safeName = name.replace(/[^\w.\- ]/g, '_').slice(0, 120);
    const path = `${practiceId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) return json({ error: `Storage upload failed: ${uploadError.message}` }, 500);

    const { data: inboxItem, error: inboxError } = await admin
      .from('inbox_messages')
      .insert({
        practice_id: practiceId,
        channel: 'upload',
        from_name: 'Manual upload',
        patient_id: patientId,
        subject: safeName,
        body: note || 'Document uploaded via Cúram web.',
        message_type: 'document',
        attachment_path: path,
        attachment_name: safeName,
        attachment_size: file.size,
      })
      .select('id')
      .single();
    if (inboxError) return json({ error: inboxError.message }, 500);

    await admin.from('audit_log').insert({
      practice_id: practiceId,
      user_id: userId,
      action: 'upload',
      entity_type: 'inbox_messages',
      entity_id: inboxItem.id,
      patient_id: patientId,
      details_json: { file: safeName, size: file.size, storage_path: path },
    });

    return json({ ok: true, kind: 'document', inboxId: inboxItem.id, message: 'Document filed to the inbox.' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
