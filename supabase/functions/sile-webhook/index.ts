import { cors, json, requireBookingKey } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Service-role client FIRST ──────────────────────────────────────────
  // VoiceHub calls carry no Supabase JWT, so RLS would block an anon/user
  // client. The service-role client must exist before key validation.
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { createClient } =
    await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(url, service);

  // ── Authenticate the practice's booking key ─────────────────────────────
  // Hashes x-booking-key and resolves it to a practice via booking_keys.
  const auth = await requireBookingKey(req, admin);
  if (auth instanceof Response) return auth;
  const keyPracticeId = auth.practiceId;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  // practiceId comes from the KEY, not the request body — a stolen/other
  // practice's key must not be able to write calls into another practice.
  const requestedPracticeId = body.practiceId as string | undefined;
  if (requestedPracticeId && requestedPracticeId !== keyPracticeId) {
    return json({ error: "practiceId does not match this booking key" }, 403);
  }
  const practiceId = keyPracticeId;

  const patientId = body.patientId as string | undefined;

  const { data, error } = await admin
    .from("sile_calls")
    .insert({
      practice_id: practiceId,
      patient_id: patientId ?? null,
      direction: body.direction === "outbound" ? "outbound" : "inbound",
      purpose: body.purpose ?? "other",
      transcript: String(body.transcript ?? body.summary ?? ""),
      outcome: String(body.outcome ?? "logged"),
      duration_seconds: Number(body.durationSeconds ?? 0),
      recording_url: body.recordingUrl ?? null,
    })
    .select("id")
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ logged: true, callId: data.id });
});
