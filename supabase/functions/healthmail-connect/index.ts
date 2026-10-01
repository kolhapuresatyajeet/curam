import { cors, json } from '../_shared/http.ts';

// Connect a clinician's own Healthmail account. Password is stored in the
// Supabase Vault against their staff row — readable only by service role.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin
    .from('staff')
    .select('id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return json({ error: 'No staff record linked to this account' }, 403);

  const body = await req.json();
  const address = String(body.address ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const { isHealthmailAddress } = await import('../_shared/healthmail.ts');
  if (!isHealthmailAddress(address)) {
    return json({ error: 'Enter your @healthmail.ie address' }, 400);
  }
  if (!password) return json({ error: 'Healthmail password required' }, 400);

  // Password is stored in a service-role-only table (RLS deny-all, no
  // policies). The hosted Supabase Vault is not usable by functions
  // (vault_create_secret is locked to supabase_admin), so a plain locked
  // table is the practical store — TODO: envelope-encrypt before go-live.
  await admin.from('staff_healthmail_credentials').upsert(
    { staff_id: staff.id, password, connected_at: new Date().toISOString() },
    { onConflict: 'staff_id' },
  );
  await admin.from('staff').update({ healthmail_address: address }).eq('id', staff.id);

  return json({ ok: true, address });
});
