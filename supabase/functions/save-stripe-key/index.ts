import { cors, json } from '../_shared/http.ts';

// Saves a practice's own Stripe secret key into Supabase Vault (never a plain table).
// Only GP / practice-manager roles may set keys.

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
    .select('practice_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return json({ error: 'No practice linked to this account' }, 403);
  if (!['gp', 'pm'].includes(staff.role ?? '')) {
    return json({ error: 'Only a GP or practice manager can update billing settings' }, 403);
  }

  const body = await req.json();
  const secretKey = String(body.secretKey ?? '').trim();
  const publishable = String(body.publishableKey ?? '').trim();
  if (!secretKey.startsWith('sk_')) return json({ error: 'Enter the Stripe secret key (starts with sk_)' }, 400);
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    return json({ error: 'Unrecognised key format' }, 400);
  }

  // Vault: secret value is encrypted at rest; only service role can read decrypted_secrets.
  const { data: vaultRow, error: vaultError } = await admin.rpc('vault_create_secret', {
    p_name: `stripe_sk_${staff.practice_id}`,
    p_secret: secretKey,
  });
  if (vaultError || !vaultRow) {
    // Fallback for CLI-vault quirks: try direct insert.
    const { data: inserted, error: insertError } = await admin
      .from('vault.secrets')
      .insert({ name: `stripe_sk_${staff.practice_id}`, secret: secretKey })
      .select('id')
      .single();
    if (insertError || !inserted) return json({ error: vaultError?.message ?? insertError?.message ?? 'Could not store key' }, 500);
    await admin.from('practice_vault_refs').upsert({
      practice_id: staff.practice_id,
      stripe_secret_id: inserted.id,
      stripe_publishable: publishable || null,
    });
    return json({ ok: true });
  }

  await admin.from('practice_vault_refs').upsert({
    practice_id: staff.practice_id,
    stripe_secret_id: vaultRow,
    stripe_publishable: publishable || null,
  });

  return json({ ok: true, live: secretKey.startsWith('sk_live_') });
});

// helper RPC fallback used above is created in migration 014.
