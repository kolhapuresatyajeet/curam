-- Staff removal: when a GP/PM removes a staff member we set active = false
-- and null their user_id (revoking the login link). Without this fix,
-- claim_staff_slot would match the removed (unclaimed) row by email and
-- silently re-grant access on their next sign-in. Only active rows are
-- claimable; a removed member returns via a fresh invite (new active row).

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
      and coalesce(active, true)
    returning id into claimed;

  return claimed is not null;
end;
$$;
