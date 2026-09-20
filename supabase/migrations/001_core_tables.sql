-- Core practice, staff, patients
create extension if not exists "pgcrypto";

create table if not exists practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  eircode text,
  phone text,
  healthlink_id text,
  healthmail text,
  pcrs_reg text,
  stripe_account_id text,
  created_at timestamptz default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  user_id uuid references auth.users(id),
  name text not null,
  role text not null check (role in ('gp','nurse','pm','receptionist','hca','locum')),
  email text,
  phone text,
  sessions text,
  permissions jsonb default '[]'::jsonb,
  active boolean default true
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  first_name text not null,
  last_name text not null,
  dob date not null,
  gender text,
  pps_number text,
  gms_number text,
  ihi_number text,
  medical_card_type text,
  phone text,
  email text,
  address text,
  eircode text,
  pharmacy_name text,
  pharmacy_healthmail text,
  allergies text,
  smoking_status text,
  gdpr_consent boolean default false,
  sile_consent boolean default false,
  created_at timestamptz default now()
);

create table if not exists patient_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  condition_code text,
  condition_name text,
  coding_system text check (coding_system in ('icpc2','icd10','snomed')),
  status text check (status in ('active','resolved')),
  diagnosed_date date
);

create index if not exists idx_staff_practice on staff(practice_id);
create index if not exists idx_patients_practice on patients(practice_id);
create index if not exists idx_patients_name on patients(last_name, first_name);
