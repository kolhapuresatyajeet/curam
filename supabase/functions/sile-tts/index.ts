// Síle premium voice — ElevenLabs text-to-speech proxy (Phase 3, feature-flagged).
//
// The ElevenLabs API key is an Edge secret and NEVER ships to the browser.
// The client (silePremiumVoice flag, on by default only for testing) sends one
// short reply chunk; we return MP3 audio, which the browser decodes and plays.
//
// ⚠️ COMPLIANCE — READ BEFORE PRODUCTION
// Síle's replies can contain patient identifiers (names, ages, results).
// api.elevenlabs.io is US-hosted. Before this ships beyond testing, either:
//   1. point ELEVENLABS_BASE_URL at an ElevenLabs EU-residency endpoint, or
//   2. complete their DPA + zero-retention arrangement and get DPO sign-off,
// and flip the `silePremiumVoice` feature flag default back to false. Until
// then the flag exists so this can be tested and revoked instantly.
//
// Usage is metered into ai_usage_log (per-character cost) against the same
// monthly AI cap as the scribe and sile-command.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Default voice: "Sarah" (mature, reassuring, confident — en female). Override
// per practice later with the ELEVENLABS_VOICE_ID secret.
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
// Lowest-latency model; half the per-character price of Turbo.
const DEFAULT_MODEL = 'eleven_flash_v2_5';
// Flash ≈ $0.11 / 1k characters at Creator tier → 110 millicents/char.
// Deliberately conservative so the monthly cap trips early, not late.
const DEFAULT_MILLICENTS_PER_CHAR = Number(Deno.env.get('ELEVENLABS_MILLICENTS_PER_CHAR') ?? '110');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  if (!apiKey) return json({ error: 'Premium voice not configured (ELEVENLABS_API_KEY missing) — falling back to on-device voice.' }, 503);

  // Auth: caller's Supabase JWT. No PHI is read from the database here — we
  // only need identity (and practice for metering).
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin.from('staff').select('id, practice_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  const practiceId = staff?.practice_id;

  const { text } = await req.json().catch(() => ({ text: '' }));
  if (!text?.trim()) return json({ error: 'text required' }, 400);
  if (text.length > 2_000) return json({ error: 'text too long (client chunks at ~280 chars)' }, 413);

  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') ?? DEFAULT_VOICE_ID;
  const model = Deno.env.get('ELEVENLABS_MODEL') ?? DEFAULT_MODEL;
  const base = (Deno.env.get('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');

  const elRes = await fetch(`${base}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.trim(),
      model_id: model,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!elRes.ok) {
    const detail = (await elRes.text().catch(() => '')).slice(0, 200);
    return json({ error: `ElevenLabs TTS failed (HTTP ${elRes.status}) ${detail}` }, 502);
  }
  const audio = await elRes.arrayBuffer();

  // Meter per character — best-effort, never block the audio on failure.
  if (practiceId) {
    try {
      await admin.from('ai_usage_log').insert({
        practice_id: practiceId,
        user_id: userData.user.id,
        kind: 'sile-tts',
        model,
        audio_seconds: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_millicents: Math.max(1, Math.round(text.trim().length * DEFAULT_MILLICENTS_PER_CHAR)),
      });
    } catch {
      /* metering best-effort */
    }
  }

  return new Response(audio, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
});
