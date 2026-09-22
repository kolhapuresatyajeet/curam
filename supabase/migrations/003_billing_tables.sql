create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  patient_id uuid not null references patients(id),
  appointment_id uuid references appointments(id),
  staff_id uuid references staff(id),
  billing_source text,
  amount numeric(10,2) not null,
  paid_amount numeric(10,2) default 0,
  status text,
  pcrs_claim_id uuid,
  insurer_claim_ref text,
  stripe_payment_id text,
  issued_at timestamptz default now()
);

create table if not exists pcrs_claims (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  patient_id uuid not null references patients(id),
  invoice_id uuid references invoices(id),
  stc_code text,
  submission_date date,
  status text,
  rejection_reason text
);

create index if not exists idx_invoices_practice on invoices(practice_id, status);
create index if not exists idx_pcrs_practice on pcrs_claims(practice_id, status);
