// One-click VoiceHub AI receptionist provisioning (onboarding step 2).
//
//   POST /functions/v1/voicehub-provision   (Authorization: Bearer <user JWT>)
//
// GP / practice-manager only. Server-side because the VoiceHub provisioning
// secret must never reach the browser. Flow:
//   1. Mint a per-clinic booking API key (cbk_…) — hash stored in booking_keys,
//      plaintext passed to VoiceHub once as the clinic's x-booking-key.
//   2. Call VoiceHub POST /api/provision/onboard (agent + Twilio number +
//      portal login are created there; transactional, safe to retry).
//   3. Persist tenant/agent/phone on the practice row and return the response
//      (including the one-time portal setup link for the success screen).
//
// Secrets: VOICEHUB_PROVISIONING_API_KEY, VOICEHUB_ONBOARD_URL (optional —
// defaults to VoiceHub production). The one-time setup_url is NOT stored —
// it expires in ~1h; re-sending is VoiceHub's send-invite endpoint.

import { cors, json } from '../_shared/http.ts';
import { sha256Hex } from '../_shared/booking-keys.ts';

const ONBOARD_URL = Deno.env.get('VOICEHUB_ONBOARD_URL') ?? 'https://voicehub-v2.vercel.app/api/provision/onboard';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const provisioningKey = Deno.env.get('VOICEHUB_PROVISIONING_API_KEY') ?? '';
  if (!provisioningKey) return json({ error: 'VoiceHub provisioning is not configured yet' }, 503);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin
    .from('staff')
    .select('practice_id, role, name, email')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!staff) return json({ error: 'No practice linked to this account' }, 403);
  if (!['gp', 'pm'].includes(staff.role ?? '')) {
    return json({ error: 'Only a GP or practice manager can connect the receptionist' }, 403);
  }

  const { data: practice } = await admin
    .from('practices')
    .select('id, name, address, phone, opening_hours, voicehub_agent_id')
    .eq('id', staff.practice_id)
    .maybeSingle();
  if (!practice) return json({ error: 'Practice not found' }, 404);
  if (practice.voicehub_agent_id) return json({ error: 'VoiceHub is already connected to this practice' }, 409);

  // ── Mint the clinic's booking key ────────────────────────────────────────
  const apiKey = `cbk_live_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  const keyHash = await sha256Hex(apiKey);
  const { error: keyError } = await admin
    .from('booking_keys')
    .insert({ key_hash: keyHash, practice_id: practice.id });
  if (keyError) return json({ error: keyError.message }, 500);

  // ── Build the VoiceHub payload ───────────────────────────────────────────
  // Opening hours are free text ("Mon–Fri 09:00–17:00") — pull the first two
  // HH:MM times for the agent's schedule; fall back to 09:00–17:00.
  const times = (practice.opening_hours ?? '').match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  const opening = times[0] ?? '09:00';
  const closing = times[1] ?? '17:00';

  const payload = {
    practice: {
      name: practice.name,
      email: staff.email, // becomes the VoiceHub portal login
      address: practice.address || undefined,
      provider_name: staff.name,
      // No phone_number: let VoiceHub buy a dedicated Irish number — the
      // practice's existing landline is never hijacked.
      timezone: 'Europe/Dublin',
      opening_hour: opening,
      closing_hour: closing,
      slot_duration_mins: 15,
    },
    curam: { api_key: apiKey, practice_id: practice.id },
    auto_provision_number: true,
    number_country: 'IE',
  };

  const onboardRes = await fetch(ONBOARD_URL, {
    method: 'POST',
    headers: { 'x-api-key': provisioningKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await onboardRes.json().catch(() => ({}));

  if (!onboardRes.ok) {
    // Roll back the minted key — VoiceHub rolled back its side.
    await admin.from('booking_keys').delete().eq('key_hash', keyHash);
    const message =
      onboardRes.status === 503 ? 'VoiceHub provisioning is temporarily unavailable — try again shortly' :
      onboardRes.status === 502 ? 'No Irish phone numbers available right now — try again shortly' :
      onboardRes.status === 401 ? 'VoiceHub rejected the provisioning key — check VOICEHUB_PROVISIONING_API_KEY' :
      (result?.error as string) ?? `VoiceHub provisioning failed (HTTP ${onboardRes.status})`;
    return json({ error: message }, onboardRes.status === 400 ? 400 : 502);
  }

  // ── Persist the connection ───────────────────────────────────────────────
  const connectedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from('practices')
    .update({
      voicehub_agent_id: result.agent_id ?? null,
      voicehub_tenant_id: result.tenant_id ?? null,
      voicehub_phone: result.phone_number ?? null,
      voicehub_portal_email: staff.email,
      voicehub_connected_at: connectedAt,
    })
    .eq('id', practice.id);
  if (updateError) {
    // Connection exists but couldn't be recorded — report it; retrying the
    // step isn't possible (already connected), reception can fix in Settings.
    return json({ ...result, warning: `Connected, but saving to the practice record failed: ${updateError.message}` }, 201);
  }

  return json(result, 201);
});
