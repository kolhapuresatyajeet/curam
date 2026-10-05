-- VoiceHub AI receptionist provisioning (one-click onboarding integration).
--
-- booking_keys: per-clinic booking API keys (cbk_…) handed to VoiceHub. Only the
-- SHA-256 hash is stored; the plaintext key is shown once during provisioning.
-- RLS on, no policies — service role (edge functions) only.
create table if not exists booking_keys (
  key_hash text primary key,
  practice_id uuid not null references practices(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table booking_keys enable row level security;

-- VoiceHub tenant + portal login tracking on the practice row.
alter table practices
  add column if not exists voicehub_tenant_id text,
  add column if not exists voicehub_portal_email text;
