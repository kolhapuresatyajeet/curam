-- Household: one main member (phone account holder) plus family on the same number.

alter table patients
  add column if not exists household_id uuid,
  add column if not exists is_primary boolean not null default true,
  add column if not exists relationship text not null default 'self'
    check (relationship in ('self', 'spouse', 'child', 'parent', 'other'));

-- Existing patients start as their own household (primary / self).
update patients
set household_id = id
where household_id is null;

alter table patients
  alter column household_id set not null;

-- Group people who already share a mobile at the same practice.
-- Oldest adult (or oldest person if no adult) becomes the main member.
with ranked as (
  select
    p.id,
    p.practice_id,
    right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) as last9,
    row_number() over (
      partition by p.practice_id, right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9)
      order by
        case when extract(year from age(p.dob)) >= 18 then 0 else 1 end,
        p.dob asc nulls last,
        p.created_at asc
    ) as rn
  from patients p
  where length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 9
)
update patients p
set
  household_id = primary_member.id,
  is_primary = (ranked.rn = 1),
  relationship = case
    when ranked.rn = 1 then 'self'
    when extract(year from age(p.dob)) < 18 then 'child'
    else 'other'
  end
from ranked
join ranked as primary_member
  on primary_member.practice_id = ranked.practice_id
 and primary_member.last9 = ranked.last9
 and primary_member.rn = 1
where p.id = ranked.id
  and ranked.last9 <> '';

create index if not exists idx_patients_household on patients (household_id);
create unique index if not exists idx_patients_one_primary
  on patients (household_id) where is_primary;

-- Voice lookup returns household fields so identify can label family members.
-- Must DROP: CREATE OR REPLACE cannot change a function's OUT/return row type.
drop function if exists public.patients_by_mobile(text);

create or replace function patients_by_mobile(p_phone text)
returns table (
  id uuid,
  practice_id uuid,
  first_name text,
  last_name text,
  dob date,
  sile_consent boolean,
  phone text,
  household_id uuid,
  is_primary boolean,
  relationship text
)
language sql
stable
as $$
  with n as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as last9
  )
  select
    p.id, p.practice_id, p.first_name, p.last_name, p.dob, p.sile_consent, p.phone,
    p.household_id, p.is_primary, p.relationship
  from patients p
  cross join n
  where n.last9 <> ''
    and length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 9
    and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = n.last9
  order by p.is_primary desc, p.dob asc;
$$;
