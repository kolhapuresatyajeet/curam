-- Fix RLS recursion and allow first-user bootstrap (practice + own staff row).

create or replace function public.current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id from staff where user_id = auth.uid() and active is not false limit 1
$$;

drop policy if exists practices_isolation on practices;
drop policy if exists staff_isolation on staff;

create policy practices_select on practices
  for select to authenticated
  using (id = public.current_practice_id());

create policy practices_update on practices
  for update to authenticated
  using (id = public.current_practice_id());

create policy practices_insert on practices
  for insert to authenticated
  with check (true);

create policy staff_select on staff
  for select to authenticated
  using (user_id = auth.uid() or practice_id = public.current_practice_id());

create policy staff_insert on staff
  for insert to authenticated
  with check (user_id = auth.uid());

create policy staff_update on staff
  for update to authenticated
  using (practice_id = public.current_practice_id());

create policy patients_insert on patients
  for insert to authenticated
  with check (practice_id = public.current_practice_id());

create policy patients_update on patients
  for update to authenticated
  using (practice_id = public.current_practice_id());

create policy conditions_all on patient_conditions
  for all to authenticated
  using (patient_id in (select id from patients where practice_id = public.current_practice_id()))
  with check (patient_id in (select id from patients where practice_id = public.current_practice_id()));

create policy consultations_all on consultations
  for all to authenticated
  using (patient_id in (select id from patients where practice_id = public.current_practice_id()))
  with check (patient_id in (select id from patients where practice_id = public.current_practice_id()));

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
