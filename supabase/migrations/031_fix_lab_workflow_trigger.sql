-- Fix fn_queue_workflow_event: it referenced new.practice_id directly, but
-- lab_results has no practice_id column — every lab_results INSERT failed
-- with 42703 "record new has no field practice_id" (including HealthLink
-- ingest). Derive the practice from the row itself, mirroring the audit
-- trigger fix in 029: practice_id → patient's practice → staff's practice.

create or replace function public.fn_queue_workflow_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
  row_json jsonb;
  derived_practice uuid;
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
    row_json := to_jsonb(new);
    derived_practice := coalesce(
      (row_json->>'practice_id')::uuid,
      (select p.practice_id from patients p where p.id = (row_json->>'patient_id')::uuid),
      (select s.practice_id from staff s where s.id = (row_json->>'staff_id')::uuid)
    );

    insert into workflow_events (practice_id, event_type, entity_type, entity_id, patient_id, payload)
    values (
      derived_practice, ev, tg_table_name, new.id,
      new.patient_id,
      to_jsonb(new) - 'results_json' - 'ai_transcript'
    );
  end if;
  return new;
end;
$$;
