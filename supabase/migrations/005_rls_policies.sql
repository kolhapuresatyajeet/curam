alter table practices enable row level security;
alter table staff enable row level security;
alter table patients enable row level security;
alter table patient_conditions enable row level security;
alter table consultations enable row level security;
alter table prescriptions enable row level security;
alter table repeat_rx_requests enable row level security;
alter table lab_results enable row level security;
alter table referrals enable row level security;
alter table cdm_enrolments enable row level security;
alter table cdm_reviews enable row level security;
alter table appointments enable row level security;
alter table waiting_room enable row level security;
alter table invoices enable row level security;
alter table pcrs_claims enable row level security;
alter table inbox_messages enable row level security;
alter table sms_log enable row level security;
alter table workflow_definitions enable row level security;
alter table workflow_runs enable row level security;
alter table sile_calls enable row level security;
alter table audit_log enable row level security;

create or replace function public.current_practice_id()
returns uuid
language sql
stable
as $$
  select practice_id from staff where user_id = auth.uid() limit 1
$$;

create policy practices_isolation on practices
  using (id = public.current_practice_id());

create policy staff_isolation on staff
  using (practice_id = public.current_practice_id());

create policy patients_isolation on patients
  using (practice_id = public.current_practice_id());

create policy appointments_isolation on appointments
  using (practice_id = public.current_practice_id());

create policy invoices_isolation on invoices
  using (practice_id = public.current_practice_id());

create policy inbox_isolation on inbox_messages
  using (practice_id = public.current_practice_id());

create policy workflows_isolation on workflow_definitions
  using (practice_id = public.current_practice_id());

create policy sile_isolation on sile_calls
  using (practice_id = public.current_practice_id());

create policy audit_isolation on audit_log
  using (practice_id = public.current_practice_id());

create policy pcrs_isolation on pcrs_claims
  using (practice_id = public.current_practice_id());
