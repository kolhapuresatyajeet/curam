drop policy if exists appointments_insert on appointments;
create policy appointments_insert on appointments
  for insert to authenticated
  with check (practice_id = public.current_practice_id());

drop policy if exists appointments_update on appointments;
create policy appointments_update on appointments
  for update to authenticated
  using (practice_id = public.current_practice_id())
  with check (practice_id = public.current_practice_id());

drop policy if exists waiting_room_all on waiting_room;
create policy waiting_room_all on waiting_room
  for all to authenticated
  using (
    appointment_id in (
      select id from appointments where practice_id = public.current_practice_id()
    )
  )
  with check (
    appointment_id in (
      select id from appointments where practice_id = public.current_practice_id()
    )
  );
