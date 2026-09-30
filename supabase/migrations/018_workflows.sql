-- Workflow engine: event queue + triggers, RLS, and seed definitions for Irish GP practice.

-- 1) Event queue — triggers write here; the workflow-engine function drains it.
create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  patient_id uuid,
  payload jsonb,
  created_at timestamptz default now()
);
create index if not exists workflow_events_created on workflow_events (created_at);

alter table workflow_events enable row level security;
create policy workflow_events_isolation on workflow_events
  using (practice_id = public.current_practice_id());

-- 2) Isolation for definitions and run history.
alter table workflow_runs add column if not exists practice_id uuid references practices(id);

drop policy if exists workflow_definitions_isolation on workflow_definitions;
create policy workflow_definitions_isolation on workflow_definitions
  for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

drop policy if exists workflow_runs_isolation on workflow_runs;
create policy workflow_runs_isolation on workflow_runs
  for all to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

-- 3) CDM recall support.
alter table cdm_enrolments add column if not exists next_review_date date;

-- 4) Event triggers.
create or replace function public.fn_queue_workflow_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
begin
  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      ev := 'appointment_created';
    elsif old.status is distinct from new.status then
      if new.status = 'dna' then ev := 'appointment_dna';
      elsif new.status = 'cancelled' then ev := 'appointment_cancelled';
      elsif new.status = 'completed' then ev := 'appointment_completed';
      end if;
    end if;
  elsif tg_table_name = 'lab_results' and tg_op = 'INSERT' then
    ev := 'lab_result_received';
  end if;

  if ev is not null then
    insert into workflow_events (practice_id, event_type, entity_type, entity_id, patient_id, payload)
    values (
      new.practice_id, ev, tg_table_name, new.id,
      (case when tg_table_name = 'lab_results' then new.patient_id else new.patient_id end),
      to_jsonb(new) - 'results_json' - 'ai_transcript'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_workflow_events on appointments;
create trigger appointments_workflow_events
  after insert or update on appointments
  for each row execute function public.fn_queue_workflow_event();

drop trigger if exists lab_results_workflow_events on lab_results;
create trigger lab_results_workflow_events
  after insert on lab_results
  for each row execute function public.fn_queue_workflow_event();

-- 6) Run count helper (idempotent from the engine).
create or replace function public.increment_workflow_run_count(p_workflow_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update workflow_definitions set run_count = coalesce(run_count, 0) + 1 where id = p_workflow_id;
$$;

revoke execute on function public.increment_workflow_run_count(uuid) from anon, authenticated;

-- 7) Cron: drain every 5 minutes.
select cron.schedule(
  'curam-workflow-engine',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/workflow-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', 'c7f4a9d2e86b41f0a5c3d7e9b2f64a18'
    ),
    body := '{}'::jsonb
  ) $$
);

-- 5) Seed definitions for existing practices (idempotent).
insert into workflow_definitions (practice_id, name, trigger_event, conditions_json, actions_json, active)
select p.id, v.name, v.trigger_event, v.conditions_json::jsonb, v.actions_json::jsonb, v.active
from practices p
cross join (values
  ('No-show follow-up', 'appointment_dna', '{}',
   '[{"type":"sms","template":"dna"}]'::text, true),
  ('Appointment confirmation (native — see booking flow)', 'appointment_created', '{}',
   '[{"type":"sms","template":"confirmation"}]'::text, false),
  ('Lab result routing', 'lab_result_received', '{}',
   '[{"type":"inbox_task","template":"lab_result"}]'::text, true),
  ('Invoice unpaid 7 days', 'invoice_unpaid_7d', '{}',
   '[{"type":"email","template":"invoice_reminder"},{"type":"inbox_task","template":"invoice_unpaid"}]'::text, true),
  ('CDM review due', 'cdm_review_due', '{}',
   '[{"type":"inbox_task","template":"cdm_recall"},{"type":"sms","template":"cdm_recall"}]'::text, true)
) as v(name, trigger_event, conditions_json, actions_json, active)
where not exists (
  select 1 from workflow_definitions d where d.practice_id = p.id and d.name = v.name
);
