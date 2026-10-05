-- Folder-watch bridge keys (037). Per-practice API keys for the optional
-- desktop folder-watch script: it watches the practice's HealthLink drop
-- folder and uploads each new file to the report-upload edge function with
-- the key in the x-bridge-key header. Only the SHA-256 hash is stored —
-- the plaintext key is shown once when minted.

create table if not exists bridge_keys (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  key_hash text not null unique,
  name text not null default 'Folder-watch bridge',
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Service-role only: no RLS policies granted to authenticated/anon roles.
alter table bridge_keys enable row level security;
