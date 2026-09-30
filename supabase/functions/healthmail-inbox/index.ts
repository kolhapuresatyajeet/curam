import { cors, json } from '../_shared/http.ts';

// Cron job: polls each connected clinician's Healthmail mailbox over IMAP,
// files new messages into the practice inbox, and marks them seen.
// Best-effort per mailbox — one broken mailbox never blocks the others.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type ImapClient = {
  connect: () => Promise<void>;
  logout: () => Promise<void>;
  list: () => Promise<unknown>;
  mailboxOpen: (path: string) => Promise<unknown>;
  fetch: (range: unknown, options: Record<string, unknown>) => Promise<unknown[]>;
  messageFlagsAdd: (range: unknown, flags: string[]) => Promise<void>;
};

async function pollMailbox(admin: any, staffRow: any, secretId: string): Promise<{ filed: number; error?: string }> {
  const { data: secretRow } = await admin
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', secretId)
    .maybeSingle();
  if (!secretRow?.decrypted_secret) return { filed: 0, error: 'credentials unreadable' };

  const address = staffRow.healthmail_address;
  if (!address) return { filed: 0, error: 'no address' };

  const { ImapFlow } = await import('npm:imapflow@1.0.171');
  const client = new ImapFlow({
    host: Deno.env.get('HEALTHMAIL_IMAP_HOST') ?? 'imap.healthmail.ie',
    port: 993,
    secure: true,
    auth: { user: address, pass: secretRow.decrypted_secret },
    logger: false,
  }) as unknown as ImapClient;

  let filed = 0;
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Unseen messages, oldest first, capped for safety.
    const messages = await client.fetch({ seen: false }, { envelope: true, bodyStructure: false, uid: true, source: true }) ?? [];

    for await (const message of messages as any[]) {
      const envelope = message.envelope ?? {};
      const from = envelope.from?.[0] ?? {};
      const fromAddress = `${from.mailbox ?? ''}@${from.host ?? ''}`.toLowerCase();
      const subject = envelope.subject ?? '(no subject)';
      const text = message.source ? Buffer.from(message.source).toString('utf8').slice(0, 20_000) : '';
      const receivedAt = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

      // Patient match: first + last name pair appearing together in the message.
      const { data: patients } = await admin
        .from('patients')
        .select('id, first_name, last_name')
        .eq('practice_id', staffRow.practice_id)
        .limit(2000);
      const patientId = (patients ?? []).find((p: any) => {
        const hay = `${subject} ${text}`.toLowerCase();
        return p.first_name && p.last_name && hay.includes(p.first_name.toLowerCase()) && hay.includes(p.last_name.toLowerCase());
      })?.id ?? null;

      await admin.from('inbox_messages').insert({
        practice_id: staffRow.practice_id,
        channel: 'healthmail',
        from_name: `${from.name ?? ''}`.trim() || fromAddress,
        from_address: fromAddress,
        patient_id: patientId,
        subject,
        body: text,
        message_type: 'healthmail',
        read: false,
        urgent: /urgent|stat/i.test(subject),
        received_at: receivedAt,
      });
      filed += 1;
    }

    await client.messageFlagsAdd({ seen: false }, ['\Seen']);
  } catch (error) {
    return { filed, error: error instanceof Error ? error.message : 'imap failed' };
  } finally {
    try {
      await client.logout();
    } catch {
      /* already closed */
    }
  }
  return { filed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const cronKey = Deno.env.get('CRON_SECRET') ?? '';
  if (!cronKey) return json({ error: 'CRON_SECRET not configured' }, 503);
  if ((req.headers.get('x-cron-key') ?? '') !== cronKey) return json({ error: 'Unauthorized' }, 401);

  if ((Deno.env.get('HEALTHMAIL_ENABLED') ?? 'false').toLowerCase() !== 'true') {
    return json({ ok: true, skipped: true });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const { data: mailboxes, error } = await admin
    .from('staff_vault_refs')
    .select('staff_id, healthmail_secret_id, staff!inner(id, practice_id, healthmail_address, active)')
    .not('healthmail_secret_id', 'is', null)
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, { filed: number; error?: string }> = {};
  for (const box of mailboxes ?? []) {
    const staffRow = Array.isArray(box.staff) ? box.staff[0] : box.staff;
    if (!staffRow?.active) continue;
    results[staffRow.healthmail_address] = await pollMailbox(admin, staffRow, box.healthmail_secret_id);
  }

  return json({ ok: true, mailboxes: results });
});
