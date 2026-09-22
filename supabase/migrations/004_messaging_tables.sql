create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  channel text,
  from_name text,
  from_address text,
  patient_id uuid references patients(id),
  subject text,
  body text,
  message_type text,
  assigned_to uuid references staff(id),
  read boolean default false,
  urgent boolean default false,
  received_at timestamptz default now()
);

create table if not exists sms_log (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  direction text,
  message text,
  status text,
  sent_at timestamptz default now()
);

create table if not exists workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  name text not null,
  trigger_event text,
  conditions_json jsonb,
  actions_json jsonb,
  active boolean default true,
  run_count int default 0
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflow_definitions(id),
  patient_id uuid references patients(id),
  trigger_data jsonb,
  actions_executed jsonb,
  result text,
  ran_at timestamptz default now()
);

create table if not exists sile_calls (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  patient_id uuid references patients(id),
  direction text,
  purpose text,
  transcript text,
  outcome text,
  duration_seconds int,
  recording_url text,
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  patient_id uuid,
  details_json jsonb,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_inbox_practice on inbox_messages(practice_id, received_at desc);
create index if not exists idx_audit_practice on audit_log(practice_id, created_at desc);
create index if not exists idx_sile_practice on sile_calls(practice_id, created_at desc);
