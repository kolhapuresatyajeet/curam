create or replace function patients_by_mobile(p_phone text)
returns table (
  id uuid,
  practice_id uuid,
  first_name text,
  last_name text,
  dob date,
  sile_consent boolean,
  phone text
)
language sql
stable
as $$
  with n as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as last9
  )
  select p.id, p.practice_id, p.first_name, p.last_name, p.dob, p.sile_consent, p.phone
  from patients p
  cross join n
  where n.last9 <> ''
    and length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 9
    and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = n.last9;
$$;

revoke all on function patients_by_mobile(text) from public;
grant execute on function patients_by_mobile(text) to service_role;

create index if not exists idx_patients_phone_last9
  on patients ((right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)));
