-- Sprint 20-21: Production hardening.
-- 1) FK indexes for the remaining hot lookups.
-- 2) GDPR retention RPC: adults 8 years from last activity, children until 25.

-- 1) Indexes (IF NOT EXISTS keeps this idempotent).
create index if not exists idx_prescriptions_patient on prescriptions(patient_id);
create index if not exists idx_prescriptions_status on prescriptions(status) where status = 'active';
create index if not exists idx_repeat_rx_patient on repeat_rx_requests(patient_id, created_at desc);
create index if not exists idx_referrals_patient on referrals(patient_id);
create index if not exists idx_patient_conditions_patient on patient_conditions(patient_id);
create index if not exists idx_invoices_patient on invoices(patient_id, issued_at desc);
create index if not exists idx_appointments_patient on appointments(patient_id, start_time desc);
create index if not exists idx_cdm_enrolments_patient on cdm_enrolments(patient_id);
create index if not exists idx_cdm_reviews_enrolment on cdm_reviews(enrolment_id);
create index if not exists idx_workflow_runs_workflow on workflow_runs(workflow_id, ran_at desc);
create index if not exists idx_sms_log_patient on sms_log(patient_id, sent_at desc);
create index if not exists idx_patients_app_user on patients(app_user_id) where app_user_id is not null;

-- 2) GDPR retention check — can this patient's record be erased?
-- Rule: adults: 8 years after last recorded activity; children: until age 25.
-- Returns can_erase=false with a human reason while retention applies.
create or replace function public.patient_retention_status(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_patient patients%rowtype;
  v_last_activity timestamptz;
  v_reason text;
  v_age_now int;
  v_can_erase boolean := false;
begin
  if public.current_practice_id() is null then
    raise exception 'not authenticated as staff';
  end if;

  select * into v_patient from patients where id = p_patient_id;
  if v_patient.id is null then
    return jsonb_build_object('can_erase', false, 'reason', 'Patient not found');
  end if;

  select max(latest) into v_last_activity
  from (
    select max(created_at) as latest from consultations where patient_id = p_patient_id
    union all
    select max(received_at) from lab_results where patient_id = p_patient_id
    union all
    select max(start_time) from appointments where patient_id = p_patient_id
    union all
    select max(created_at) from invoices where patient_id = p_patient_id
  ) activity;

  v_age_now := date_part('year', age(coalesce(v_last_activity::date, v_patient.dob), v_patient.dob));

  if v_patient.dob is not null and v_patient.dob + interval '25 years' < now() then
    -- Was a child, now past 25 — retention long expired.
    v_can_erase := true;
  elsif v_last_activity is not null and v_last_activity + interval '8 years' < now() and v_age_now >= 18 then
    v_can_erase := true;
  else
    if v_age_now < 18 then
      v_reason := 'Child record — retained until age 25 (currently under 18).';
    elsif v_last_activity is null then
      v_reason := 'No recorded activity — contact the practice to confirm before erasing.';
    else
      v_reason := format(
        'Adult record — retained 8 years after last activity (%s). Erasure available from %s.',
        to_char(v_last_activity, 'DD/MM/YYYY'),
        to_char(v_last_activity + interval '8 years', 'DD/MM/YYYY')
      );
    end if;
  end if;

  return jsonb_build_object(
    'can_erase', v_can_erase,
    'reason', coalesce(v_reason, 'Retention period still running.'),
    'last_activity', v_last_activity
  );
end;
$$;

revoke execute on function public.patient_retention_status(uuid) from anon;
-- The function itself rejects non-staff callers, so authenticated staff can call it.
grant execute on function public.patient_retention_status(uuid) to authenticated, service_role;
