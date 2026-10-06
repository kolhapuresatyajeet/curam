import { dublinWallToIso } from "../_shared/ireland.ts";
import { googleBusyWindows } from "../_shared/google-calendar.ts";
import { cors, json, requireBookingKey } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const params = new URL(req.url);
  const day =
    params.searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    return json({ error: "date must be YYYY-MM-DD" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { createClient } =
    await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(supabaseUrl, service);

  // ── Authenticate via per-clinic booking key ─────────────────────────────
  const auth = await requireBookingKey(req, admin);
  if (auth instanceof Response) return auth;
  const practiceId = auth.practiceId;

  // Body practiceId cannot override the key-scoped practice.
  const requestedPracticeId = params.searchParams.get("practiceId");
  if (requestedPracticeId && requestedPracticeId !== practiceId) {
    return json(
      { error: "practiceId does not match this booking key" },
      403,
    );
  }

  let staffQuery = admin
    .from("staff")
    .select("id, name, practice_id")
    .eq("active", true)
    .in("role", ["gp", "nurse"])
    .eq("practice_id", practiceId);
  const { data: staff } = await staffQuery;
  if (!staff?.length)
    return json({ date: day, timezone: "Europe/Dublin", slots: [] });

  const dayStart = dublinWallToIso(day, 8, 30);
  const dayEnd = dublinWallToIso(day, 17, 30);
  const { data: booked } = await admin
    .from("appointments")
    .select("staff_id, start_time, end_time")
    .neq("status", "cancelled")
    .gte("start_time", dayStart)
    .lt("start_time", dayEnd);

  const busyByStaff: Record<string, { start: string; end: string }[]> = {};
  await Promise.all(
    staff.map(async (member) => {
      busyByStaff[member.id] = await googleBusyWindows(
        admin,
        member.id,
        dayStart,
        dayEnd,
      );
    }),
  );

  const slots: { staffId: string; staffName: string; startTime: string }[] =
    [];
  for (const member of staff) {
    for (
      let hour = 8, minute = 30;
      hour < 17 || (hour === 17 && minute < 30);

    ) {
      const startIso = dublinWallToIso(day, hour, minute);
      minute += 20;
      if (minute >= 60) {
        hour += 1;
        minute -= 60;
      }
      const endIso = dublinWallToIso(day, hour, minute);
      const taken = booked?.some(
        (row) =>
          row.staff_id === member.id &&
          new Date(row.start_time) < new Date(endIso) &&
          new Date(row.end_time) > new Date(startIso),
      );
      const googleBusy = busyByStaff[member.id]?.some(
        (block) =>
          new Date(block.start) < new Date(endIso) &&
          new Date(block.end) > new Date(startIso),
      );
      if (!taken && !googleBusy) {
        slots.push({
          staffId: member.id,
          staffName: member.name,
          startTime: startIso,
        });
      }
    }
  }

  return json({
    date: day,
    timezone: "Europe/Dublin",
    slots: slots.slice(0, 40),
  });
});
