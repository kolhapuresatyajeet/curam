-- Auto-seed default workflow definitions when a new practice is created.
-- Previously these were only seeded at migration-time, so any practice
-- onboarded after migration 018 started with an empty Workflows page.

create or replace function public.fn_seed_practice_workflows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into workflow_definitions (practice_id, name, trigger_event, conditions_json, actions_json, active)
  values
    (new.id, 'No-show follow-up', 'appointment_dna', '{}'::jsonb,
     '[{"type":"sms","template":"dna"}]'::jsonb, true),
    (new.id, 'Appointment confirmation (native — see booking flow)', 'appointment_created', '{}'::jsonb,
     '[{"type":"sms","template":"confirmation"}]'::jsonb, false),
    (new.id, 'Lab result routing', 'lab_result_received', '{}'::jsonb,
     '[{"type":"inbox_task","template":"lab_result"}]'::jsonb, true),
    (new.id, 'Invoice unpaid 7 days', 'invoice_unpaid_7d', '{}'::jsonb,
     '[{"type":"email","template":"invoice_reminder"},{"type":"inbox_task","template":"invoice_unpaid"}]'::jsonb, true),
    (new.id, 'CDM review due', 'cdm_review_due', '{}'::jsonb,
     '[{"type":"inbox_task","template":"cdm_recall"},{"type":"sms","template":"cdm_recall"}]'::jsonb, true);

  return new;
end;
$$;

create trigger practices_seed_workflows
  after insert on practices
  for each row execute function public.fn_seed_practice_workflows();

-- Backfill: seed workflows for any practices that were created after migration
-- 018 and currently have no workflow definitions.
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
