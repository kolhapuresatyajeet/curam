// Staff directory for voice-agent partners (VoiceHub "which doctor?" flow).
//
//   POST /functions/v1/staff-directory
//   x-booking-key: <per-clinic cbk_… key minted at provisioning>
//
// Response shape is deliberately tolerant (VoiceHub's CuramAdapter accepts any
// of: bare array, {staff:[…]}; per item: id|staffId and name|staffName) — we
// return the wrapped shape with duplicated keys so every variant matches.
//
// A per-clinic key is scoped to its own practice; the body practiceId cannot
// widen it. Only active clinical staff (GPs + nurses) are listed — patients'
// calls are only ever booked with them, matching appointment-availability.

import { cors, json, requireBookingKey } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { createClient } =
    await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(url, service);

  const auth = await requireBookingKey(req, admin);
  if (auth instanceof Response) return auth;
  const keyPracticeId = auth.practiceId;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  // Practice comes from the KEY — body practiceId is only allowed if it
  // matches, preventing one practice's key from reading another's roster.
  if (body.practiceId && body.practiceId !== keyPracticeId) {
    return json({ error: "practiceId does not match this booking key" }, 403);
  }
  const practiceId = keyPracticeId;

  const { data: staff, error } = await admin
    .from("staff")
    .select("id, name, role")
    .eq("practice_id", practiceId)
    .eq("active", true)
    .in("role", ["gp", "nurse"])
    .order("role")
    .order("name");
  if (error) return json({ error: error.message }, 400);

  const directory = (staff ?? []).map(
    (member: { id: string; name: string; role: string }) => ({
      id: member.id,
      staffId: member.id,
      name: member.name,
      staffName: member.name,
      role: member.role,
    }),
  );

  return json({ staff: directory });
});
