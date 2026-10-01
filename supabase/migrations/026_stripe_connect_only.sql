-- Stripe Connect is the only supported billing path. The manual key-paste
-- machinery (pre-Connect) is removed — the product was never live, so there is
-- nothing to migrate.
drop table if exists practice_billing_keys;
drop table if exists practice_vault_refs;
drop function if exists public.practice_has_own_stripe_key();
