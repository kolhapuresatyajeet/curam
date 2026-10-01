-- audit_log.practice_id is NOT NULL, and some audited tables carry neither
-- practice_id nor a usable JWT context (service-role writes). Derive the
-- practice from the row itself: practice_id → patient's practice → staff's
-- practice.

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
as $$
declare
  row_json jsonb;
  derived_practice uuid;
begin
  if tg_op = 'DELETE' then
    row_json := to_jsonb(old);
  else
    row_json := to_jsonb(new);
  end if;

  derived_practice := coalesce(
    (row_json->>'practice_id')::uuid,
    (select p.practice_id from patients p where p.id = (row_json->>'patient_id')::uuid),
    (select s.practice_id from staff s where s.id = (row_json->>'staff_id')::uuid),
    public.current_practice_id()
  );

  insert into audit_log (practice_id, user_id, action, entity_type, entity_id, details_json)
  values (
    derived_practice,
    auth.uid(),
    tg_op,
    tg_table_name,
    row_json->>'id',
    jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old))
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
