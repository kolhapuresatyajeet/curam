-- SaaS billing: how GPs pay for Cúram itself (distinct from Stripe Connect,
-- which is practices taking patient payments). Flat per-practice pricing:
-- €99/month or €990/year. Free GPs redeem an assigned code (email-locked),
-- so codes can never be shared outside the intended practice.
--
-- saas_codes is deliberately RLS-denied for everyone: it is only ever read
-- or written by Edge Functions with the service role, surfaced through the
-- super-admin console.

-- Practice billing state -----------------------------------------------------
alter table practices
  add column if not exists saas_status text not null default 'none',   -- none|trial|active|past_due|free|canceled
  add column if not exists saas_plan text,                             -- monthly|yearly|free
  add column if not exists saas_customer_id text,                      -- Stripe customer (platform account)
  add column if not exists saas_period_end timestamptz;

-- Discount / affiliate codes --------------------------------------------------
create table if not exists saas_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- uppercase, no spaces
  kind text not null check (kind in ('percent', 'free')),
  percent_off int check (percent_off between 1 and 100),
  months int,                                -- discount length in months (null = forever)
  assigned_email text,                       -- null = public code; else only this email may redeem
  max_redemptions int,                       -- null = unlimited
  times_used int not null default 0,
  affiliate text,                            -- advocate who gets referral credit (payout tracking)
  note text,
  active boolean not null default true,
  created_by uuid,                           -- auth user id of the super admin who made it
  created_at timestamptz not null default now()
);
alter table saas_codes enable row level security;
-- No RLS policies on purpose: super-admin console goes through the saas-admin
-- Edge Function (service role); nothing else may touch codes.

-- Every redemption, for affiliate payouts + audit
create table if not exists saas_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  practice_id uuid not null references practices(id),
  email text,
  plan text,
  created_at timestamptz not null default now()
);
alter table saas_redemptions enable row level security;
-- No policies: service-role Edge Functions only.

-- Webhook helper: bump a code's usage counter (security definer so the
-- service-role webhook can touch the RLS-locked table without a policy).
create or replace function public.saas_bump_code_usage(p_code text) returns void
language sql security definer set search_path = public as $$
  update saas_codes set times_used = times_used + 1 where code = p_code;
$$;
