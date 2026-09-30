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
  if (!address.endsWith('@healthmail.ie')) {
    return json({ error: 'Enter your @healthmail.ie address' }, 400);
  }
  if (!password) return json({ error: 'Healthmail password required' }, 400);

  const { data: secretId, error: vaultError } = await admin.rpc('vault_create_secret', {
    p_name: `healthmail_${staff.id}`,
    p_secret: password,
  });
  if (vaultError || !secretId) return json({ error: vaultError?.message ?? 'Could not store credentials' }, 500);

  await admin.from('staff_vault_refs').upsert({ staff_id: staff.id, healthmail_secret_id: secretId, connected_at: new Date().toISOString() });
  await admin.from('staff').update({ healthmail_address: address }).eq('id', staff.id);

  return json({ ok: true, address });
});
