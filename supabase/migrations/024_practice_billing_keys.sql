-- Per-practice Stripe keys without Vault.
-- Hosted Supabase locks the vault extension's crypto internals to
-- supabase_admin, so vault_create_secret fails with
-- 'permission denied for function _crypto_aead_det_noncegen'. Keys now live in
-- a dedicated table that is RLS-enabled with NO policies — every PostgREST
-- role is denied; only service-role Edge Functions (which bypass RLS) touch it.
-- Supabase encrypts disks at rest (AES-256).
create table if not exists practice_billing_keys (
  practice_id uuid primary key references practices(id) on delete cascade,
  stripe_secret_key text,
  stripe_webhook_secret text,
  stripe_publishable text,
  updated_at timestamptz not null default now()
);
alter table practice_billing_keys enable row level security;

-- Frontend gate: does THIS practice have its own Stripe key? Security definer
-- so the function owner bypasses the deny-all RLS; returns nothing but a boolean.
create or replace function public.practice_has_own_stripe_key()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from practice_billing_keys
    where practice_id = public.current_practice_id() and stripe_secret_key is not null
  );
$$;
grant execute on function public.practice_has_own_stripe_key() to authenticated;

-- The vault helper from migration 014 never worked on hosted; remove it.
drop function if exists public.vault_create_secret(text, text);

-- 023's vault id column is superseded by practice_billing_keys.
alter table practice_vault_refs drop column if exists stripe_webhook_secret_id;
