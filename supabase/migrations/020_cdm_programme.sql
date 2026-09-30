-- Phase 5: CDM programme.
-- - Eligibility: patients carry chronic_conditions (self-reported/diagnosed codes)
-- - cdm_enrolments + cdm_reviews get practice_id and RLS isolation policies
--   (both tables previously had RLS enabled with no policies = fully denied).
-- - Enrolment status gains a check constraint.

alter table patients add column if not exists chronic_conditions text[] not null default '{}';

-- 1) Practice ownership.
alter table cdm_enrolments add column if not exists practice_id uuid references practices(id);
alter table cdm_reviews add column if not exists practice_id uuid references practices(id);

-- 2) Isolation policies.
drop policy if exists cdm_enrolments_isolation on cdm_enrolments;
create policy cdm_enrolments_isolation on cdm_enrolments
  for all using (practice_id = public.current_practice_id());

drop policy if exists cdm_reviews_isolation on cdm_reviews;
create policy cdm_reviews_isolation on cdm_reviews
  for all using (practice_id = public.current_practice_id());

-- 3) Status constraint (active | withdrawn).
alter table cdm_enrolments drop constraint if exists cdm_enrolments_status_check;
alter table cdm_enrolments add constraint cdm_enrolments_status_check
  check (status in ('active', 'withdrawn'));

-- 4) Backfill practice_id from the patient (single-practice-per-patient data).
update cdm_enrolments e set practice_id = p.practice_id
  from patients p where e.patient_id = p.id and e.practice_id is null;
update cdm_reviews r set practice_id = p.practice_id
  from patients p where r.patient_id = p.id and r.practice_id is null;
