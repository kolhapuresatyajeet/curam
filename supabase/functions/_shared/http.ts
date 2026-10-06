import { sha256Hex } from "./booking-keys.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-key",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Validates VoiceHub's x-booking-key against the per-practice keys minted by
// voicehub-provision (sha256-hashed into booking_keys). Replaces the old
// static BOOKING_API_KEY check — a single shared secret can't be per-practice.
//
// Usage (admin = service-role client, created BEFORE this call):
//   const auth = await requireBookingKey(req, admin);
//   if (auth instanceof Response) return auth;   // 401 — key missing/unknown
//   const practiceId = auth.practiceId;          // verified practice scope
export async function requireBookingKey(
  req: Request,
  admin: SupabaseClient,
): Promise<{ practiceId: string } | Response> {
  const provided = req.headers.get("x-booking-key") ?? "";
  if (!provided) return json({ error: "Voice agent key required" }, 401);

  const keyHash = await sha256Hex(provided);
  const { data } = await admin
    .from("booking_keys")
    .select("practice_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data) return json({ error: "Voice agent key required" }, 401);
  return { practiceId: data.practice_id };
}
