-- Separate flags for the two reminder waves (keeps legacy reminder_sent intact).
alter table appointments add column if not exists reminder_48h_sent boolean default false;
alter table appointments add column if not exists reminder_2h_sent boolean default false;

-- Index for the reminder scanner: due appointments by start time.
create index if not exists appointments_start_upcoming
  on appointments (start_time)
  where status <> 'cancelled';

-- pg_cron + pg_net drive the reminder Edge Function every 15 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'curam-sms-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', 'c7f4a9d2e86b41f0a5c3d7e9b2f64a18'
    ),
    body := '{}'::jsonb
  ) $$
);
