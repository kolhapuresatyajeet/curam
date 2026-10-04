//
// Síle premium voice — ElevenLabs TTS (Phase 3, behind the silePremiumVoice
// feature flag). The API key lives in Edge secrets; this module just fetches
// MP3 chunks from the sile-tts edge function. Every failure path returns null
// so the engine can fall back to the on-device (Kokoro / OS voice) stack
// silently — premium voice is an upgrade, never a dependency.
//
import { getFlag } from '@/lib/featureFlags';
import { supabase, supabaseConfigured } from '@/lib/supabase';

export function premiumVoiceEnabled(): boolean {
  return getFlag('silePremiumVoice');
}

/** Same ~280-char sentence grouping the on-device Kokoro path uses: playback
 *  starts after the first chunk while later chunks are still being fetched. */
export function chunkForTts(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > 280) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

/** Fetch one text chunk as MP3 audio. Returns null on ANY failure (no key
 *  configured, signed out, offline, 5xx) so callers can degrade gracefully. */
export async function fetchPremiumChunk(text: string): Promise<ArrayBuffer | null> {
  if (!premiumVoiceEnabled() || !supabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/sile-tts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}
