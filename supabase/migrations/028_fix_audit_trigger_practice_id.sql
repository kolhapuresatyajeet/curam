-- Fix the audit trigger: the original version referenced new.practice_id /
-- old.practice_id directly, but several audited tables (prescriptions,
-- consultations, repeat_rx_requests, lab_results, referrals) have no
-- practice_id column — every INSERT/UPDATE/DELETE on them failed with
-- 42703 "record new has no field practice_id". Read practice_id/id from the
-- row's jsonb instead, which yields NULL for tables without the column.

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
as $$
declare
  row_json jsonb;
begin
  if tg_op = 'DELETE' then
    row_json := to_jsonb(old);
  else
    row_json := to_jsonb(new);
  end if;

  insert into audit_log (practice_id, user_id, action, entity_type, entity_id, details_json)
  values (
    coalesce((row_json->>'practice_id')::uuid, public.current_practice_id()),
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
