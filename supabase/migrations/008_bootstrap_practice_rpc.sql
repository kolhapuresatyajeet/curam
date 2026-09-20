-- First-practice bootstrap must bypass table RLS: INSERT ... RETURNING
-- is checked against SELECT policies, and current_practice_id() is null
-- until the staff row exists.

create or replace function public.bootstrap_practice(
  p_name text,
  p_address text,
  p_eircode text,
  p_phone text,
  p_staff_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_practice practices%rowtype;
  v_staff staff%rowtype;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_staff from staff where user_id = v_user limit 1;
  if found then
    select * into v_practice from practices where id = v_staff.practice_id;
    return jsonb_build_object('practice', to_jsonb(v_practice), 'staff', to_jsonb(v_staff));
  end if;

  insert into practices (name, address, eircode, phone)
  values (p_name, p_address, p_eircode, p_phone)
  returning * into v_practice;

  insert into staff (
    practice_id, user_id, name, role, email, phone, sessions, permissions, active
  )
  values (
    v_practice.id, v_user, p_staff_name, 'gp', v_email, p_phone, 'Mon–Fri', '["gp"]'::jsonb, true
  )
  returning * into v_staff;

  return jsonb_build_object('practice', to_jsonb(v_practice), 'staff', to_jsonb(v_staff));
end;
$$;

revoke all on function public.bootstrap_practice(text, text, text, text, text) from public, anon;
grant execute on function public.bootstrap_practice(text, text, text, text, text) to authenticated;
