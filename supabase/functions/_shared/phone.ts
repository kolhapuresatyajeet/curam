/** Normalise IE / E.164 caller IDs to 08XXXXXXXX. */
export function irishMobileNational(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('353')) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('8')) digits = `0${digits}`;
  if (/^08\d{8}$/.test(digits)) return digits;
  return null;
}

export type MatchedPatient = {
  id: string;
  practice_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  sile_consent: boolean;
  phone: string | null;
};

export async function matchPatientByMobile(
  admin: { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: MatchedPatient[] | null; error: { message: string } | null }> },
  phone: string,
): Promise<{ patient?: MatchedPatient; error?: string; status: 400 | 404 | 409 | 200 }> {
  const national = irishMobileNational(phone);
  if (!national) return { error: 'A valid Irish mobile number is required', status: 400 };
  const { data, error } = (await admin.rpc('patients_by_mobile', { p_phone: national })) as {
    data: MatchedPatient[] | null;
    error: { message: string } | null;
  };
  if (error) return { error: error.message, status: 400 };
  if (!data?.length) return { error: 'No patient is registered with this mobile number', status: 404 };
  if (data.length > 1) {
    return { error: 'More than one patient shares this number. A receptionist must help.', status: 409 };
  }
  return { patient: data[0], status: 200 };
}
