-- Stripe billing: per-practice key references (secret in Supabase Vault),
-- fee schedule for auto-invoicing, payment link storage.
create table if not exists practice_vault_refs (
  practice_id uuid primary key references practices(id),
  stripe_secret_id uuid,            -- vault.secrets id, nullable = not connected
  stripe_publishable text
);

create table if not exists practice_fees (
  practice_id uuid not null references practices(id),
  appointment_type text not null,
  price numeric(10,2) not null,
  primary key (practice_id, appointment_type)
);

-- Seed sensible defaults for the practice's standard visit types.
insert into practice_fees (practice_id, appointment_type, price)
select p.id, t.appt_type, t.price
from practices p
cross join (values
  ('routine', 65.00), ('urgent', 80.00), ('nurse', 40.00),
  ('phone', 35.00), ('video', 45.00), ('home_visit', 100.00), ('vaccination', 30.00)
) as t(appt_type, price)
on conflict do nothing;

alter table invoices add column if not exists payment_link_url text;
alter table invoices add column if not exists description text;

alter table practice_vault_refs enable row level security;
alter table practice_fees enable row level security;

create policy practice_vault_refs_isolation on practice_vault_refs
  using (practice_id = public.current_practice_id());
create policy practice_fees_isolation on practice_fees
  using (practice_id = public.current_practice_id());

-- Thin wrapper so service-role Edge Functions can write to the vault cleanly.
create or replace function public.vault_create_secret(p_name text, p_secret text)
returns uuid
language sql
security definer
set search_path = public, vault
as $$
  insert into vault.secrets (name, secret) values (p_name, p_secret) returning id;
$$;

revoke execute on function public.vault_create_secret(text, text) from anon, authenticated;

-- Auto-invoice when an appointment completes. GMS visits go through PCRS
-- capitation/claims instead, so no invoice is raised for them.
create or replace function create_invoice_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_type text;
  fee numeric(10,2);
  source text;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select medical_card_type into card_type from patients where id = new.patient_id;
    if card_type in ('gms', 'gp_visit') then
      return new; -- billed via PCRS, not invoiced per visit
    end if;
    if exists (select 1 from invoices where appointment_id = new.id) then
      return new; -- idempotent
    end if;
    select price into fee from practice_fees
      where practice_id = new.practice_id and appointment_type = new.type;
    fee := coalesce(fee, 65.00);
    source := 'private';
    insert into invoices (practice_id, patient_id, appointment_id, staff_id, billing_source, amount, paid_amount, status, description, issued_at)
    values (
      new.practice_id, new.patient_id, new.id, new.staff_id, source, fee, 0, 'unbilled',
      format('%s appointment on %s', initcap(coalesce(new.type, 'routine')), to_char(new.start_time at time zone 'Europe/Dublin', 'DD/MM/YYYY')),
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_create_invoice on appointments;
create trigger appointments_create_invoice
  after update on appointments
  for each row execute function create_invoice_on_completion();
