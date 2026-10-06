// Booking API key utilities for voice-agent partners (VoiceHub, Síle).
//
// Per-clinic keys (cbk_…) are minted during VoiceHub provisioning. Only the
// SHA-256 hash is stored in booking_keys; a match scopes every call to that
// clinic's practice_id.
//
// Auth validation lives in http.ts → requireBookingKey(). This file only
// exports the crypto primitive.

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
