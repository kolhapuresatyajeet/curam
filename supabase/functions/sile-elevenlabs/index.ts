import { cors, json } from '../_shared/http.ts';

// ElevenLabs Conversational AI proxy — keeps the API key server-side.
//
//   GET ?resource=list                    → recent conversations (with transcripts)
//   GET ?resource=audio&id=<conversation> → streams the call recording (binary)
//
// The app embeds audio + transcripts directly on the Síle call-log page; it
// never links out to ElevenLabs. Requires a signed-in staff JWT (verify_jwt).

const API_BASE = 'https://api.elevenlabs.io/v1/convai';
const PAGE_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  if (!apiKey) return json({ error: 'ElevenLabs is not configured (ELEVENLABS_API_KEY missing)' }, 503);

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') ?? 'list';
  const id = url.searchParams.get('id');

  // Staff-only: verify the JWT resolves to a staff row.
  const { createClient: makeClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = makeClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  );
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Sign in first' }, 401);
  const admin = makeClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: staff } = await admin.from('staff').select('id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  if (!staff) return json({ error: 'No staff record linked to this account' }, 403);

  try {
    if (resource === 'list') {
      const res = await fetch(`${API_BASE}/conversations?limit=${PAGE_SIZE}`, { headers: { 'xi-api-key': apiKey } });
      const body = await res.json();
      if (!res.ok) return json({ error: body?.detail?.message ?? `ElevenLabs list failed (HTTP ${res.status})` }, 502);

      // Fetch transcripts for the most recent conversations so the call log
      // renders complete transcripts without extra round-trips.
      const conversations = await Promise.all(
        (body.conversations ?? []).slice(0, 10).map(async (c: Record<string, unknown>) => {
          const cid = String(c.conversation_id ?? '');
          let transcript = '';
          try {
            const detail = await fetch(`${API_BASE}/conversations/${cid}`, { headers: { 'xi-api-key': apiKey } });
            if (detail.ok) {
              const d = await detail.json();
              transcript = (d.transcript ?? [])
                .map((t: { role: string; message: string }) => `${t.role === 'agent' ? 'Síle' : 'Caller'}: ${t.message}`)
                .join('\n');
            }
          } catch {
            /* transcript is best-effort; the call row still shows */
          }
          return {
            id: cid,
            agentName: String(c.agent_name ?? 'Síle'),
            startTime: Number(c.start_time_unix_secs ?? 0) * 1000,
            success: c.call_successful === 'succeeded',
            durationSeconds: Number(c.call_duration_secs ?? 0),
            transcript,
          };
        }),
      );
      return json({ conversations });
    }

    if (resource === 'audio') {
      if (!id) return json({ error: 'id required' }, 400);
      const res = await fetch(`${API_BASE}/conversations/${id}/audio`, { headers: { 'xi-api-key': apiKey } });
      if (!res.ok || !res.body) return json({ error: `ElevenLabs audio failed (HTTP ${res.status})` }, 502);
      return new Response(res.body, {
        headers: { ...cors, 'Content-Type': res.headers.get('content-type') ?? 'audio/mpeg' },
      });
    }

    return json({ error: 'Unknown resource' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'ElevenLabs request failed' }, 502);
  }
});
