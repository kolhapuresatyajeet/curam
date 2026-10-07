/** Normalise IE / E.164 caller IDs to 08XXXXXXXX. */
export function irishMobileNational(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("353")) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith("8")) digits = `0${digits}`;
  if (/^08\d{8}$/.test(digits)) return digits;
  return null;
}

export type HouseholdRelationship =
  | "self"
  | "spouse"
  | "child"
  | "parent"
  | "other";

export type MatchedPatient = {
  id: string;
  practice_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  sile_consent: boolean;
  phone: string | null;
  household_id?: string | null;
  is_primary?: boolean | null;
  relationship?: string | null;
};

/** VoiceHub household member — never include DOB. */
export type HouseholdMember = {
  patientId: string;
  firstName: string;
  lastName: string;
  relationship?: Exclude<HouseholdRelationship, "self">;
};

export function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  return Math.floor((Date.now() - birth.getTime()) / (365.25 * 86400000));
}

export function householdMember(row: MatchedPatient): HouseholdMember {
  const member: HouseholdMember = {
    patientId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
  };
  const stored = row.relationship;
  if (stored && stored !== "self") {
    member.relationship = stored as Exclude<HouseholdRelationship, "self">;
  } else if (ageFromDob(String(row.dob)) < 18) {
    member.relationship = "child";
  }
  return member;
}

/** Book for a child if the main member on this number has Síle consent. */
export function householdAllowsVoice(
  members: MatchedPatient[],
  chosen: MatchedPatient,
): boolean {
  if (chosen.sile_consent) return true;
  return members.some((p) => p.is_primary && p.sile_consent);
}

function last9Digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-9);
}

function isChildMember(row: MatchedPatient): boolean {
  return row.relationship === "child" || ageFromDob(String(row.dob)) < 18;
}

type AdminClient = {
  rpc: (
    fn: string,
    args: Record<string, string>,
  ) => Promise<{
    data: MatchedPatient[] | null;
    error: { message: string } | null;
  }>;
  from: (table: string) => {
    select: (cols: string) => {
      in: (
        col: string,
        vals: string[],
      ) => Promise<{ data: MatchedPatient[] | null }>;
    };
  };
};

export async function matchPatientsByMobile(
  admin: AdminClient,
  phone: string,
): Promise<{
  patients: MatchedPatient[];
  error?: string;
  status: 400 | 404 | 200;
}> {
  const national = irishMobileNational(phone);
  if (!national)
    return {
      patients: [],
      error: "A valid Irish mobile number is required",
      status: 400,
    };
  const { data, error } = (await admin.rpc("patients_by_mobile", {
    p_phone: national,
  })) as {
    data: MatchedPatient[] | null;
    error: { message: string } | null;
  };
  if (error) return { patients: [], error: error.message, status: 400 };
  if (!data?.length) {
    return {
      patients: [],
      error: "No patient is registered with this mobile number",
      status: 404,
    };
  }

  // Parent's mobile also reaches children who have no handset of their own.
  // Spouses/adults with a different number are not pulled in — they call on theirs.
  const householdIds = [
    ...new Set(
      data
        .map((p) => p.household_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const callerLast9 = last9Digits(national);
  if (householdIds.length) {
    const { data: extras } = await admin
      .from("patients")
      .select(
        "id, practice_id, first_name, last_name, dob, sile_consent, phone, household_id, is_primary, relationship",
      )
      .in("household_id", householdIds);
    const known = new Set(data.map((p) => p.id));
    for (const extra of extras ?? []) {
      if (known.has(extra.id)) continue;
      if (!isChildMember(extra)) continue;
      const own = last9Digits(extra.phone);
      if (own.length >= 9 && own !== callerLast9) continue;
      data.push(extra);
      known.add(extra.id);
    }
  }

  return { patients: data, status: 200 };
}

/** Single-patient lookup. Households (2+) are returned as patients, not an error. */
export async function matchPatientByMobile(
  admin: AdminClient,
  phone: string,
): Promise<{
  patient?: MatchedPatient;
  patients?: MatchedPatient[];
  error?: string;
  status: 400 | 404 | 409 | 200;
}> {
  const result = await matchPatientsByMobile(admin, phone);
  if (result.status !== 200)
    return { error: result.error, status: result.status, patients: [] };
  if (result.patients.length === 1) {
    return { patient: result.patients[0], patients: result.patients, status: 200 };
  }
  return { patients: result.patients, status: 409 };
}
