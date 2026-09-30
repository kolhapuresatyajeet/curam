-- Phase 4: HealthLink bridge support.
-- bridge_agents: registered desktop agents at the practice (heartbeat monitoring).
-- healthlink_messages: raw HL7 audit log of every message in/out via the bridge.
-- referrals gains bridge outbox columns (queued -> submitted -> acked).

-- 1) Registered bridge agents.
create table if not exists bridge_agents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  agent_key text unique not null,          -- per-agent credential issued by ingest fn
  hostname text,
  version text,
  status text not null default 'offline' check (status in ('online','offline','error')),
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

alter table bridge_agents enable row level security;

drop policy if exists bridge_agents_isolation on bridge_agents;
create policy bridge_agents_isolation on bridge_agents
  for select using (practice_id = public.current_practice_id());

-- 2) Raw HL7 message audit log (HIQA: log every HealthLink interaction).
create table if not exists healthlink_messages (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null,              -- ORU | ADT | REF | OML | other
  healthlink_message_id text,
  status text not null default 'received' check (status in ('received','parsed','error','submitted','acked')),
  error text,
  bridge_agent_id uuid references bridge_agents(id),
  raw_content text,
  created_at timestamptz default now()
);

create index if not exists idx_healthlink_messages_practice
  on healthlink_messages(practice_id, created_at desc);

alter table healthlink_messages enable row level security;

drop policy if exists healthlink_messages_isolation on healthlink_messages;
create policy healthlink_messages_isolation on healthlink_messages
  for select using (practice_id = public.current_practice_id());

-- 3) Referral outbox for the bridge agent to submit via HealthLink.
alter table referrals
  add column if not exists bridge_status text default null
    check (bridge_status in ('queued','submitted','acked','error')),
  add column if not exists bridge_queued_at timestamptz,
  add column if not exists bridge_submitted_at timestamptz,
  add column if not exists bridge_payload jsonb,
  add column if not exists bridge_error text;
