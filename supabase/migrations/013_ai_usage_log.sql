-- Metering for AI scribe (and future AI features). Every call logs actual usage
-- so cost per practice is visible and monthly caps can be enforced.
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  user_id uuid not null,
  kind text not null,                    -- 'scribe' | future: 'sile_note', 'coding'
  model text not null,
  audio_seconds int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_millicents int not null default 0, -- 1000 = $0.01
  created_at timestamptz default now()
);

create index if not exists ai_usage_practice_month
  on ai_usage_log (practice_id, created_at);

alter table ai_usage_log enable row level security;

create policy ai_usage_practice_isolation on ai_usage_log
  using (practice_id = public.current_practice_id());
