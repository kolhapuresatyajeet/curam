-- Stripe Connect (Express hosted onboarding): each practice connects their own
-- Stripe account with one click; Cúram creates/reuses a connected Express
-- account and stores the acct_ id. Payments are created in the practice's
-- account via the Stripe-Account header — money never touches Cúram.
alter table practices add column if not exists stripe_connected_at timestamptz;
