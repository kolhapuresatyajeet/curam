import { cors, json, requireBookingKey } from "../_shared/http.ts";
import {
  ageFromDob,
  householdAllowsVoice,
  householdMember,
  irishMobileNational,
  matchPatientsByMobile,
  type MatchedPatient,
} from "../_shared/phone.ts";

const EMERGENCY =
  /chest pain|difficulty breathing|can't breathe|cannot breathe|shortness of breath|unconscious|stroke|severe bleeding/i;

function publicPatient(row: {
  id: string;
  practice_id: string;
  first_name: string;
  last_name: string;
  sile_consent: boolean;
}) {
  return {
    patientId: row.id,
    practiceId: row.practice_id,
    firstName: row.first_name,
    lastName: row.last_name,
    sileConsent: row.sile_consent,
  };
}

function patientName(row: MatchedPatient) {
  return `${row.first_name} ${row.last_name}`.trim();
}

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
  const action = String(body.action ?? "identify");
  const phone = String(body.phone ?? body.mobile ?? body.callerNumber ?? "");
  const requestedPatientId = String(body.patientId ?? "").trim() || undefined;

  if (action === "register") {
    const national = irishMobileNational(phone);
    if (!national)
      return json({ error: "A valid Irish mobile number is required" }, 400);
    const firstName = String(
      body.firstName ?? body.patientFirstName ?? "",
    ).trim();
    const lastName = String(body.lastName ?? body.patientLastName ?? "").trim();
    const dob = String(body.dob ?? body.dateOfBirth ?? "");
    if (!firstName || !lastName || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return json(
        { error: "firstName, lastName and dob (YYYY-MM-DD) are required" },
        400,
      );
    }
    if (body.gdprConsent !== true && body.gdprConsent !== "true") {
      return json(
        { error: "Caller must confirm GDPR consent before registration" },
        400,
      );
    }

    const existing = await matchPatientsByMobile(admin, national);
    const household = existing.patients.filter(
      (p) => p.practice_id === keyPracticeId,
    );
    const duplicate = household.find(
      (p) =>
        p.first_name.toLowerCase() === firstName.toLowerCase() &&
        p.last_name.toLowerCase() === lastName.toLowerCase() &&
        String(p.dob).slice(0, 10) === dob,
    );
    if (duplicate) {
      return json(
        {
          error: "That person is already registered on this mobile number",
          patient: publicPatient(duplicate),
          patients: household.map(householdMember),
        },
        409,
      );
    }

    if (body.practiceId && body.practiceId !== keyPracticeId) {
      return json({ error: "practiceId does not match this booking key" }, 403);
    }

    const storedPhone = `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
    const joining = household[0];
    const newId = crypto.randomUUID();
    const allowed = ["spouse", "child", "parent", "other"] as const;
    const requestedRel = String(body.relationship ?? "").toLowerCase();
    const relationship = joining
      ? allowed.includes(requestedRel as (typeof allowed)[number])
        ? requestedRel
        : ageFromDob(dob) < 18
          ? "child"
          : "other"
      : "self";
    const { data: created, error } = await admin
      .from("patients")
      .insert({
        id: newId,
        practice_id: keyPracticeId,
        first_name: firstName,
        last_name: lastName,
        dob,
        gender: body.gender ?? "unknown",
        phone: storedPhone,
        email: body.email ?? "",
        address: body.address ?? "",
        eircode: body.eircode ?? "",
        gdpr_consent: true,
        sile_consent: body.sileConsent === false ? false : true,
        household_id: joining?.household_id ?? joining?.id ?? newId,
        is_primary: !joining,
        relationship,
      })
      .select("id, practice_id, first_name, last_name, sile_consent")
      .single();
    if (error || !created)
      return json(
        { error: error?.message ?? "Could not register patient" },
        400,
      );

    return json({ registered: true, patient: publicPatient(created) }, 201);
  }

  const lookup = await matchPatientsByMobile(admin, phone);
  if (lookup.status !== 200) {
    return json({ error: lookup.error }, lookup.status);
  }
  const household = lookup.patients.filter(
    (p) => p.practice_id === keyPracticeId,
  );
  if (!household.length) return json({ error: "Patient not found" }, 404);

  const members = household.map(householdMember);

  if (action === "identify") {
    if (household.length === 1) {
      return json({
        patient: publicPatient(household[0]),
        patients: members,
      });
    }
    // Spec §8b: several people on this number — agent reads names, asks once.
    // No DOBs. 409 so VoiceHub's adapter treats this as a household pick.
    return json({ patients: members }, 409);
  }

  let patient: MatchedPatient | undefined;
  if (requestedPatientId) {
    patient = household.find((p) => p.id === requestedPatientId);
    if (!patient) {
      return json(
        {
          error: "That person is not registered on this mobile number",
          patients: members,
        },
        409,
      );
    }
  } else if (household.length === 1) {
    patient = household[0];
  } else {
    return json(
      {
        error: "Several people share this number. Pass patientId for the chosen person.",
        patients: members,
      },
      409,
    );
  }

  if (action === "list") {
    const ids = requestedPatientId
      ? [patient.id]
      : household.map((p) => p.id);
    const byId = new Map(household.map((p) => [p.id, p]));
    const { data: appointments, error } = await admin
      .from("appointments")
      .select("id, start_time, end_time, type, status, staff_id, patient_id")
      .in("patient_id", ids)
      .neq("status", "cancelled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(10);
    if (error) return json({ error: error.message }, 400);
    return json({
      patient: publicPatient(patient),
      patients: members,
      appointments: (appointments ?? []).map((row) => {
        const owner = byId.get(row.patient_id);
        return {
          ...row,
          patientId: row.patient_id,
          patientName: owner ? patientName(owner) : undefined,
        };
      }),
    });
  }

  if (action === "cancel") {
    let appointmentId = body.appointmentId as string | undefined;
    if (!appointmentId) {
      const { data: upcoming } = await admin
        .from("appointments")
        .select("id")
        .eq("patient_id", patient.id)
        .in("status", ["scheduled", "confirmed"])
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(2);
      if (!upcoming?.length)
        return json({ error: "No upcoming appointment to cancel" }, 404);
      if (upcoming.length > 1) {
        return json(
          {
            error:
              "Patient has more than one upcoming appointment. Pass appointmentId.",
          },
          409,
        );
      }
      appointmentId = upcoming[0].id;
    }

    const householdIds = household.map((p) => p.id);
    const { data: existing, error: findError } = await admin
      .from("appointments")
      .select("id, status, start_time, patient_id")
      .eq("id", appointmentId)
      .in("patient_id", householdIds)
      .maybeSingle();
    if (findError) return json({ error: findError.message }, 400);
    if (!existing)
      return json(
        { error: "Appointment not found for this mobile number" },
        404,
      );
    if (!["scheduled", "confirmed"].includes(existing.status ?? "")) {
      return json(
        { error: "That appointment cannot be cancelled by voice" },
        409,
      );
    }

    const { error: updateError } = await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", existing.id);
    if (updateError) return json({ error: updateError.message }, 400);

    const { syncAppointmentToGoogle } =
      await import("../_shared/google-calendar.ts");
    await syncAppointmentToGoogle(admin, existing.id);
    try {
      const { notifyAppointmentEmails } =
        await import("../_shared/booking-mail.ts");
      await notifyAppointmentEmails(admin, existing.id, "cancelled");
    } catch {
      /* Patient email is independent of GP email */
    }
    try {
      const { notifyAppointmentSms } = await import("../_shared/sms.ts");
      await notifyAppointmentSms(admin, existing.id, "cancelled");
    } catch {
      /* SMS must never fail the cancellation */
    }

    await admin.from("sile_calls").insert({
      practice_id: patient.practice_id,
      patient_id: existing.patient_id,
      direction: "inbound",
      purpose: "booking",
      transcript: String(body.reason ?? "Cancelled by voice agent"),
      outcome: `Cancelled ${existing.id}`,
      duration_seconds: Number(body.callDurationSeconds ?? 0),
    });

    const owner = household.find((p) => p.id === existing.patient_id);
    return json({
      cancelled: true,
      appointmentId: existing.id,
      startTime: existing.start_time,
      patientId: existing.patient_id,
      patientName: owner ? patientName(owner) : undefined,
    });
  }

  if (action !== "book")
    return json(
      { error: "action must be identify, list, book, cancel, or register" },
      400,
    );

  if (!householdAllowsVoice(household, patient)) {
    return json(
      {
        error:
          "This patient has not consented to Síle. A receptionist must book.",
      },
      403,
    );
  }

  const triage = String(body.triageNotes ?? body.reason ?? "");
  if (EMERGENCY.test(triage)) {
    return json({ emergency: "Please hang up and call 999 or 112 now." }, 409);
  }

  let staffId = body.staffId as string | undefined;
  if (!staffId) {
    const { data: gp } = await admin
      .from("staff")
      .select("id")
      .eq("practice_id", patient.practice_id)
      .eq("role", "gp")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    staffId = gp?.id;
  }
  if (!staffId)
    return json({ error: "No GP is configured for this practice" }, 400);

  const start = new Date(body.startTime as string);
  if (Number.isNaN(start.getTime()))
    return json({ error: "Invalid startTime" }, 400);
  const duration = Number(body.durationMinutes ?? 20);
  const end = new Date(start.getTime() + duration * 60_000);

  const { data: clash } = await admin
    .from("appointments")
    .select("id")
    .eq("staff_id", staffId)
    .neq("status", "cancelled")
    .lt("start_time", end.toISOString())
    .gt("end_time", start.toISOString())
    .limit(1);
  if (clash?.length) return json({ error: "That slot is already booked" }, 409);

  const { data: appointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      practice_id: patient.practice_id,
      patient_id: patient.id,
      staff_id: staffId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      type: body.type ?? "routine",
      status: "scheduled",
      booked_via: "sile",
      sile_triage_notes: triage,
      reminder_sent: false,
    })
    .select("id, start_time, staff_id")
    .single();

  if (insertError || !appointment)
    return json({ error: insertError?.message ?? "Could not book" }, 400);

  const { syncAppointmentToGoogle } =
    await import("../_shared/google-calendar.ts");
  await syncAppointmentToGoogle(admin, appointment.id);
  try {
    const { notifyAppointmentEmails } =
      await import("../_shared/booking-mail.ts");
    await notifyAppointmentEmails(admin, appointment.id, "booked");
  } catch {
    /* Patient email is independent of GP email */
  }
  try {
    const { notifyAppointmentSms } = await import("../_shared/sms.ts");
    await notifyAppointmentSms(admin, appointment.id, "booked");
  } catch {
    /* SMS must never fail the booking */
  }

  await admin.from("sile_calls").insert({
    practice_id: patient.practice_id,
    patient_id: patient.id,
    direction: "inbound",
    purpose: "booking",
    transcript: triage,
    outcome: `Booked ${appointment.id}`,
    duration_seconds: Number(body.callDurationSeconds ?? 0),
  });

  return json({
    appointmentId: appointment.id,
    startTime: appointment.start_time,
    staffId: appointment.staff_id,
    bookedVia: "sile",
    patient: publicPatient(patient),
    patientId: patient.id,
    patientName: patientName(patient),
  });
});
