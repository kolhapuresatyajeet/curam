-- Same person may be registered at more than one clinic. Each panel row is
-- independent: voice/app lookup must never return another practice's record.

-- 1) Phone lookup is clinic-scoped (replaces the 1-arg function).
drop function if exists public.patients_by_mobile(text);

create or replace function public.patients_by_mobile(p_phone text, p_practice_id uuid)
returns table (
  id uuid,
  practice_id uuid,
  first_name text,
  last_name text,
  dob date,
  sile_consent boolean,
  phone text,
  household_id uuid,
  is_primary boolean,
  relationship text
)
language sql
stable
as $$
  with n as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as last9
  )
  select
    p.id, p.practice_id, p.first_name, p.last_name, p.dob, p.sile_consent, p.phone,
    p.household_id, p.is_primary, p.relationship
  from patients p
  cross join n
  where p.practice_id = p_practice_id
    and n.last9 <> ''
    and length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 9
    and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = n.last9
  order by p.is_primary desc, p.dob asc;
$$;

revoke all on function public.patients_by_mobile(text, uuid) from public, anon, authenticated;
grant execute on function public.patients_by_mobile(text, uuid) to service_role;

-- 2) MyCúram login may claim a row at every clinic they are registered with.
alter table patients drop constraint if exists patients_app_user_id_key;
drop index if exists idx_patients_app_user;
create unique index if not exists idx_patients_app_user_practice
  on patients (practice_id, app_user_id)
  where app_user_id is not null;

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

  -- Link every unclaimed panel row for this email (one per clinic).
  update patients
  set app_user_id = auth.uid()
  where lower(email) = lower(p_email)
    and app_user_id is null;

  select id into v_patient_id
  from patients
  where app_user_id = auth.uid()
    and lower(email) = lower(p_email)
  order by created_at
  limit 1;

  if v_patient_id is null then
    raise exception 'no patient record found for this email — contact your practice';
  end if;
  return v_patient_id;
end;
$$;

-- 3) Patient-app RLS: a user may own several clinic rows.
create or replace function public.current_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from patients where app_user_id = auth.uid();
$$;

create or replace function public.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from patients where app_user_id = auth.uid() order by created_at limit 1
$$;

drop policy if exists patients_self on patients;
create policy patients_self on patients
  for select using (id in (select public.current_patient_ids()));

drop policy if exists appointments_patient_select on appointments;
create policy appointments_patient_select on appointments
  for select using (patient_id in (select public.current_patient_ids()));

drop policy if exists appointments_patient_insert on appointments;
create policy appointments_patient_insert on appointments
  for insert with check (
    patient_id in (select public.current_patient_ids())
    and booked_via = 'online'
    and status = 'scheduled'
  );

drop policy if exists lab_results_patient_select on lab_results;
create policy lab_results_patient_select on lab_results
  for select using (
    patient_id in (select public.current_patient_ids())
    and delivery_method in ('app', 'sile', 'none')
  );

drop policy if exists prescriptions_patient_select on prescriptions;
create policy prescriptions_patient_select on prescriptions
  for select using (patient_id in (select public.current_patient_ids()));

drop policy if exists repeat_rx_patient_select on repeat_rx_requests;
create policy repeat_rx_patient_select on repeat_rx_requests
  for select using (patient_id in (select public.current_patient_ids()));

drop policy if exists repeat_rx_patient_insert on repeat_rx_requests;
create policy repeat_rx_patient_insert on repeat_rx_requests
  for insert with check (
    patient_id in (select public.current_patient_ids())
    and status = 'pending'
    and requested_via = 'app'
  );

drop policy if exists patient_messages_patient on patient_messages;
create policy patient_messages_patient on patient_messages
  for select using (patient_id in (select public.current_patient_ids()));

drop policy if exists patient_messages_patient_insert on patient_messages;
create policy patient_messages_patient_insert on patient_messages
  for insert with check (
    patient_id in (select public.current_patient_ids())
    and direction = 'to_practice'
  );

drop policy if exists patient_readings_patient on patient_readings;
create policy patient_readings_patient on patient_readings
  for all using (patient_id in (select public.current_patient_ids()))
  with check (patient_id in (select public.current_patient_ids()));
