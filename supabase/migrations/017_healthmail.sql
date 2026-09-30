-- Healthmail: per-clinician connection. The address is non-sensitive (routing),
-- the password lives in the Vault and is never exposed to other staff.
alter table staff add column if not exists healthmail_address text;

create table if not exists staff_vault_refs (
  staff_id uuid primary key references staff(id) on delete cascade,
  healthmail_secret_id uuid,   -- vault.secrets id, null = not connected
  connected_at timestamptz default now()
);

alter table staff_vault_refs enable row level security;

create policy staff_vault_refs_own on staff_vault_refs
  for select to authenticated
  using (staff_id in (select id from staff where user_id = auth.uid()));
