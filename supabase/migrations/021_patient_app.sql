-- Phase 6: MyCúram patient app backend.
-- - patients.app_user_id links a Supabase auth user to their patient record
-- - patient_messages: secure two-way messaging with the practice
-- - patient_readings: CDM self-management logs (glucose, BP, weight, symptoms)
-- - claim_patient_access RPC: links a signed-up user to the patient record
--   matching their email (practice pre-registers the patient's email).
-- - RLS: patients read only their own data; staff keep practice-wide access.

alter table patients add column if not exists app_user_id uuid unique;

-- 1) Secure messaging.
create table if not exists patient_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  direction text not null check (direction in ('to_practice','to_patient')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_patient_messages_patient on patient_messages(patient_id, created_at);

-- 2) CDM self-management readings.
create table if not exists patient_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  reading_type text not null check (reading_type in ('glucose','blood_pressure','weight','symptom')),
  systolic int,
  diastolic int,
  value numeric,
  unit text,
  notes text,
  recorded_at timestamptz default now()
);

create index if not exists idx_patient_readings_patient on patient_readings(patient_id, recorded_at desc);

-- 3) Link a newly signed-up patient app user to their record. The practice
-- pre-registers the patient's email; on first sign-in the auth user claims it.
create or replace function public.claim_patient_access(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_patient_id
  from patients
  where lower(email) = lower(p_email)
    and app_user_id is null
  order by created_at
  limit 1;

  if v_patient_id is null then
    -- Already claimed by this user? Return it for idempotency.
    select id into v_patient_id from patients
    where app_user_id = auth.uid() and lower(email) = lower(p_email);
    if v_patient_id is null then
      raise exception 'no patient record found for this email — contact your practice';
    end if;
    return v_patient_id;
  end if;

  update patients set app_user_id = auth.uid() where id = v_patient_id;
  return v_patient_id;
end;
$$;

revoke execute on function public.claim_patient_access(text) from anon;
grant execute on function public.claim_patient_access(text) to authenticated;

-- 4) Row-level security. Helper: the calling patient's own id (null for staff).
create or replace function public.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from patients where app_user_id = auth.uid() limit 1;
$$;

-- patients: patient sees own row; staff keep existing policies.
drop policy if exists patients_self on patients;
create policy patients_self on patients
  for select using (id = public.current_patient_id());

-- appointments: read own; create own online bookings.
drop policy if exists appointments_patient_select on appointments;
create policy appointments_patient_select on appointments
  for select using (patient_id = public.current_patient_id());

drop policy if exists appointments_patient_insert on appointments;
create policy appointments_patient_insert on appointments
  for insert with check (
    patient_id = public.current_patient_id()
    and booked_via = 'online'
    and status = 'scheduled'
  );

-- lab results: patient reads own (app hides abnormal values behind "contact practice").
drop policy if exists lab_results_patient_select on lab_results;
create policy lab_results_patient_select on lab_results
  for select using (patient_id = public.current_patient_id() and delivery_method in ('app','sile','none'));

-- prescriptions: patient reads own active prescriptions.
drop policy if exists prescriptions_patient_select on prescriptions;
create policy prescriptions_patient_select on prescriptions
  for select using (patient_id = public.current_patient_id());

-- repeat requests: patient sees own and can create pending ones.
drop policy if exists repeat_rx_patient_select on repeat_rx_requests;
create policy repeat_rx_patient_select on repeat_rx_requests
  for select using (patient_id = public.current_patient_id());

drop policy if exists repeat_rx_patient_insert on repeat_rx_requests;
create policy repeat_rx_patient_insert on repeat_rx_requests
  for insert with check (
    patient_id = public.current_patient_id()
    and status = 'pending'
    and requested_via = 'app'
  );

-- messaging: patient reads own thread, posts to_practice.
drop policy if exists patient_messages_patient on patient_messages;
create policy patient_messages_patient on patient_messages
  for select using (patient_id = public.current_patient_id());

drop policy if exists patient_messages_patient_insert on patient_messages;
create policy patient_messages_patient_insert on patient_messages
  for insert with check (
    patient_id = public.current_patient_id()
    and direction = 'to_practice'
  );

-- staff side: practice-wide access to messages and readings.
drop policy if exists patient_messages_staff on patient_messages;
create policy patient_messages_staff on patient_messages
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists patient_readings_patient on patient_readings;
create policy patient_readings_patient on patient_readings
  for all using (patient_id = public.current_patient_id())
  with check (patient_id = public.current_patient_id());

drop policy if exists patient_readings_staff on patient_readings;
create policy patient_readings_staff on patient_readings
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

-- repeat requests + lab results + prescriptions: patient policies above.
-- 5) LATENT BUG FIX: the following clinical tables were RLS-enabled in 005
-- with NO staff policies = fully denied for authenticated staff. None of them
-- carry practice_id, so isolation goes through the patients join.
drop policy if exists consultations_staff on consultations;
create policy consultations_staff on consultations
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists prescriptions_staff on prescriptions;
create policy prescriptions_staff on prescriptions
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists repeat_rx_staff on repeat_rx_requests;
create policy repeat_rx_staff on repeat_rx_requests
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists lab_results_staff on lab_results;
create policy lab_results_staff on lab_results
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists referrals_staff on referrals;
create policy referrals_staff on referrals
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists patient_conditions_staff on patient_conditions;
create policy patient_conditions_staff on patient_conditions
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

drop policy if exists sms_log_staff on sms_log;
create policy sms_log_staff on sms_log
  for all using (
    patient_id in (select id from patients where practice_id = public.current_practice_id())
  );

