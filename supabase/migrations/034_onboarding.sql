-- Progressive onboarding (Phase: setup wizard).
-- Signup stays a single screen; the rest is collected inside the app via a
-- skippable 4-step wizard. `onboarding_done` tracks which steps are finished
-- ('details' | 'voicehub' | 'billing' | 'team') so the dashboard card can nag
-- gently without ever gating clinical work.

alter table practices
  add column if not exists opening_hours text,
  add column if not exists voicehub_agent_id text,
  add column if not exists voicehub_phone text,
  add column if not exists voicehub_connected_at timestamptz,
  add column if not exists onboarding_done text[] not null default '{}';
