// Typed data access for the patient app. All queries run under RLS as the
// signed-in patient (patients.app_user_id = auth.uid()).
import { supabase } from './supabase';

export interface Me {
  id: string;
  practiceId: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  pharmacyName: string;
  chronicConditions: string[];
}

export interface UpcomingAppointment {
  id: string;
  startTime: string;
  type: string;
  staffName: string | null;
}

export interface ResultItem {
  id: string;
  source: string | null;
  receivedAt: string;
  abnormal: boolean;
  gpComment: string | null;
  results: unknown;
}

export interface ActiveRx {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
}

export interface Message {
  id: string;
  direction: 'to_practice' | 'to_patient';
  body: string;
  readAt: string | null;
  createdAt: string;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

// Link the signed-up user to their patient record (first sign-in).
export async function claimAccess(email: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_patient_access', { p_email: email });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function fetchMe(): Promise<Me> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, practice_id, first_name, last_name, dob, phone, email, address, pharmacy_name, chronic_conditions')
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Profile not found');
  const row = data as Record<string, string | string[] | null>;
  return {
    id: String(row.id),
    practiceId: String(row.practice_id ?? ''),
    firstName: String(row.first_name ?? ''),
    lastName: String(row.last_name ?? ''),
    dob: String(row.dob ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    pharmacyName: String(row.pharmacy_name ?? ''),
    chronicConditions: Array.isArray(row.chronic_conditions) ? row.chronic_conditions.map(String) : [],
  };
}

export async function updateProfile(patch: { phone: string; email: string; address: string; pharmacyName: string }): Promise<void> {
  const id = await requireUserId();
  const { error } = await supabase
    .from('patients')
    .update({
      phone: patch.phone,
      email: patch.email,
      address: patch.address,
      pharmacy_name: patch.pharmacyName,
    })
    .eq('id', (await fetchMe()).id)
    .eq('app_user_id', id);
  if (error) throw new Error(error.message);
}

export async function fetchNextAppointment(): Promise<UpcomingAppointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_time, type, staff:staff_id(name)')
    .gte('start_time', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string; start_time: string; type: string | null; staff: { name: string } | { name: string }[] | null;
  };
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: row.id,
    startTime: row.start_time,
    type: row.type ?? 'appointment',
    staffName: staff?.name ?? null,
  };
}

// Staff who accept online bookings, for the booking screen.
export async function fetchBookableStaff(): Promise<Array<{ id: string; name: string; role: string }>> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role')
    .eq('active', true)
    .in('role', ['gp', 'nurse']);
  if (error || !data) return [];
  return data as Array<{ id: string; name: string; role: string }>;
}

export async function bookAppointment(staffId: string, startTime: Date): Promise<void> {
  const me = await fetchMe();
  const endTime = new Date(startTime.getTime() + 15 * 60000);
  const { error } = await supabase.from('appointments').insert({
    practice_id: me.practiceId,
    patient_id: me.id,
    staff_id: staffId,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    type: 'routine',
    status: 'scheduled',
    booked_via: 'online',
  });
  if (error) throw new Error(error.message);
}

export async function fetchResults(): Promise<ResultItem[]> {
  const { data, error } = await supabase
    .from('lab_results')
    .select('id, source_hospital, received_at, abnormal_flags, gp_comment, results_json, delivery_method')
    .order('received_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    source: (row.source_hospital as string) ?? null,
    receivedAt: String(row.received_at ?? ''),
    abnormal: Array.isArray(row.abnormal_flags) && (row.abnormal_flags as string[]).length > 0,
    gpComment: (row.gp_comment as string) ?? null,
    results: row.results_json ?? {},
  }));
}

export async function fetchActivePrescriptions(): Promise<ActiveRx[]> {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('id, drug_name, dose, frequency')
    .eq('status', 'active')
    .order('id', { ascending: false });
  if (error || !data) return [];
  return (data as Array<Record<string, string | null>>).map((row) => ({
    id: String(row.id),
    drugName: String(row.drug_name ?? ''),
    dose: row.dose,
    frequency: row.frequency,
  }));
}

export async function requestRepeat(prescriptionIds: string[]): Promise<void> {
  const me = await fetchMe();
  const rows = prescriptionIds.map((prescriptionId) => ({
    patient_id: me.id,
    prescription_id: prescriptionId,
    requested_via: 'app',
    status: 'pending',
  }));
  const { error } = await supabase.from('repeat_rx_requests').insert(rows);
  if (error) throw new Error(error.message);
}

export async function fetchMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('patient_messages')
    .select('id, direction, body, read_at, created_at')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    direction: (row.direction as Message['direction']),
    body: String(row.body ?? ''),
    readAt: (row.read_at as string) ?? null,
    createdAt: String(row.created_at ?? ''),
  }));
}

export async function sendMessage(body: string): Promise<void> {
  const me = await fetchMe();
  const { error } = await supabase.from('patient_messages').insert({
    patient_id: me.id,
    direction: 'to_practice',
    body,
  });
  if (error) throw new Error(error.message);
}

// Mark messages the patient has seen (read receipts, practice side).
export async function markPracticeMessagesRead(): Promise<void> {
  const me = await fetchMe();
  const { error } = await supabase
    .from('patient_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('patient_id', me.id)
    .eq('direction', 'to_patient')
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

export interface Reading {
  id: string;
  readingType: string;
  systolic: number | null;
  diastolic: number | null;
  value: number | null;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
}

export async function fetchReadings(): Promise<Reading[]> {
  const { data, error } = await supabase
    .from('patient_readings')
    .select('id, reading_type, systolic, diastolic, value, unit, notes, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    readingType: String(row.reading_type ?? ''),
    systolic: (row.systolic as number) ?? null,
    diastolic: (row.diastolic as number) ?? null,
    value: (row.value as number) ?? null,
    unit: (row.unit as string) ?? null,
    notes: (row.notes as string) ?? null,
    recordedAt: String(row.recorded_at ?? ''),
  }));
}

export async function addReading(input: {
  readingType: 'glucose' | 'blood_pressure' | 'weight' | 'symptom';
  systolic?: number;
  diastolic?: number;
  value?: number;
  unit?: string;
  notes?: string;
}): Promise<void> {
  const me = await fetchMe();
  const { error } = await supabase.from('patient_readings').insert({
    patient_id: me.id,
    reading_type: input.readingType,
    systolic: input.systolic ?? null,
    diastolic: input.diastolic ?? null,
    value: input.value ?? null,
    unit: input.unit ?? null,
    notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
}

// GDPR Art. 15/20: fetch the patient's complete record as a JSON file and
// open the platform share sheet so it can be saved or emailed. Uses the
// patient's own session token — the Edge Function is RLS-scoped to the
// caller, so a patient can only ever receive their own data.
export async function downloadMyData(): Promise<void> {
  const { supabaseUrl } = await import('./supabase');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in first');

  const res = await fetch(`${supabaseUrl}/functions/v1/patient-data-export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
  const json = await res.text();

  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const name = `mycuram-data-${new Date().toISOString().slice(0, 10)}.json`;
  const fileUri = `${(FileSystem as { documentDirectory: string | null }).documentDirectory}${name}`;
  await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing not available on this device');
  await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'My Cúram data export' });
}
