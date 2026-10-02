import { getSupabaseConfig, supabase } from '@/lib/supabase';

// ElevenLabs call data (audio + transcript) for the Síle call log.
// The API key stays server-side in the `sile-elevenlabs` Edge Function;
// the app only ever talks to that proxy — no ElevenLabs URLs are exposed
// in the UI.

export interface LiveSileCall {
  id: string;
  agentName: string;
  startTime: number; // epoch ms
  success: boolean;
  durationSeconds: number;
  transcript: string;
}

export async function fetchLiveSileCalls(): Promise<LiveSileCall[]> {
  if (!supabase) return [];
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/sile-elevenlabs?resource=list`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({}))) as { conversations?: LiveSileCall[] };
  return payload.conversations ?? [];
}

export async function fetchLiveSileAudio(conversationId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/sile-elevenlabs?resource=audio&id=${encodeURIComponent(conversationId)}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
