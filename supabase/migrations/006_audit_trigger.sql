create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into audit_log (practice_id, user_id, action, entity_type, entity_id, details_json)
  values (
    coalesce(new.practice_id, old.practice_id, public.current_practice_id()),
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old))
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['patients','consultations','prescriptions','repeat_rx_requests','lab_results','referrals','appointments','invoices']
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function public.write_audit_log()', t, t);
  end loop;
end $$;
