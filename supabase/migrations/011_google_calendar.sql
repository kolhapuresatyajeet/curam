alter table staff add column if not exists google_email text;
alter table staff add column if not exists google_calendar_id text;
alter table staff add column if not exists google_calendar_summary text;

create table if not exists staff_google_tokens (
  staff_id uuid primary key references staff(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz
);

alter table staff_google_tokens enable row level security;

alter table appointments add column if not exists google_event_id text;
