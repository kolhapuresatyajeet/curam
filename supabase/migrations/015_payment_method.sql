-- Payment method tracking: cash / card-in-room / stripe / gms.
-- Stripe is optional — practices may collect payments in-room only.
alter table invoices add column if not exists payment_method text;
