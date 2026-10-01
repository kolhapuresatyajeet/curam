-- Per-practice Stripe webhook signing secret.
-- Each practice (using their own Stripe account via the vault-key model)
-- configures their own webhook endpoint in their Stripe dashboard pointing at
-- /functions/v1/stripe-webhook. Stripe signs with the endpoint's whsec_, so we
-- must be able to verify signatures against each practice's secret, not just
-- the platform-level STRIPE_WEBHOOK_SECRET.
alter table practice_vault_refs add column if not exists stripe_webhook_secret_id uuid;
