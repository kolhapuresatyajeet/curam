-- Add missing columns to prescriptions and referrals tables to support
-- GP-initiated creation from the consultation workflow.

-- Prescriptions: controlled substance flag.
alter table prescriptions
  add column if not exists controlled boolean default false;

-- Referrals: clinical notes and sent timestamp.
alter table referrals
  add column if not exists notes text,
  add column if not exists sent_at timestamptz;
