-- Staff invite flow: GP/PM onboards staff (row with user_id null = invited),
-- the invitee claims the slot on first Google sign-in with the invited email.

-- Practice admins (gp/pm) may create invited staff rows for their own practice.
drop policy if exists staff_insert on staff;
create policy staff_insert on staff
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or (
      user_id is null
      and practice_id = public.current_practice_id()
      and exists (
        select 1 from staff admin
        where admin.user_id = auth.uid()
          and admin.practice_id = practice_id
          and admin.role in ('gp', 'pm')
          and coalesce(admin.active, true)
      )
    )
  );

-- Invitee claims their slot on first login: email must match an unclaimed row.
create or replace function public.claim_staff_slot(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Already linked to a staff row? Nothing to do.
  if exists (select 1 from staff where user_id = auth.uid()) then
    return false;
  end if;

  update staff
    set user_id = auth.uid()
    where lower(email) = lower(p_email)
      and user_id is null
    returning id into claimed;

  return claimed is not null;
end;
$$;

grant execute on function public.claim_staff_slot(text) to authenticated;
