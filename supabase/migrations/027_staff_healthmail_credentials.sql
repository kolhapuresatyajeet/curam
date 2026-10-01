-- Prescriber Healthmail SMTP credentials.
-- Replaces the Vault approach: on hosted Supabase, vault_create_secret is
-- locked to supabase_admin and cannot be called from functions/SQL roles.
-- RLS deny-all (no policies) — only the service role can read/write.
-- TODO before go-live: envelope-encrypt the password column with a KMS key.

create table if not exists staff_healthmail_credentials (
  staff_id uuid primary key references staff(id) on delete cascade,
  password text not null,
  connected_at timestamptz not null default now()
);

alter table staff_healthmail_credentials enable row level security;
