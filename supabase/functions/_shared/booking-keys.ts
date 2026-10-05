// Booking API key resolution for voice-agent partners (VoiceHub, Síle demo).
//
// Two key kinds are accepted in the `x-booking-key` header:
//  - the master BOOKING_API_KEY secret (legacy single-tenant voice agent), or
//  - a per-clinic key `cbk_…` minted during VoiceHub provisioning. Only the
//    SHA-256 hash is stored in booking_keys; a match scopes every call to that
//    clinic's practice_id.

export interface VoiceKeyResult {
  ok: boolean;
  status?: number;
  error?: string;
  /** practice_id a per-clinic key is scoped to (null for the master key) */
  scopedPracticeId?: string | null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function resolveVoiceKey(
  admin: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  provided: string,
): Promise<VoiceKeyResult> {
  const master = Deno.env.get('BOOKING_API_KEY') ?? '';
  if (!provided) return { ok: false, status: 401, error: 'Voice agent key required' };
  if (master && provided === master) return { ok: true, scopedPracticeId: null };

  const hash = await sha256Hex(provided);
  const { data: key } = await admin
    .from('booking_keys')
    .select('practice_id')
    .eq('key_hash', hash)
    .eq('active', true)
    .maybeSingle();
  if (!key) return { ok: false, status: 401, error: 'Voice agent key required' };
  return { ok: true, scopedPracticeId: key.practice_id as string };
}
