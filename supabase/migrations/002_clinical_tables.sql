create table if not exists consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid not null references staff(id),
  appointment_id uuid,
  template_type text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  icpc2_codes text[],
  ai_scribe_used boolean default false,
  ai_transcript text,
  status text check (status in ('draft','signed')),
  signed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid not null references staff(id),
  consultation_id uuid references consultations(id),
  drug_name text not null,
  dose text,
  frequency text,
  duration_months int,
  pharmacy_healthmail text,
  healthmail_sent_at timestamptz,
  status text check (status in ('active','expired','cancelled')),
  refills_remaining int default 0
);

create table if not exists repeat_rx_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  prescription_id uuid references prescriptions(id),
  requested_via text,
  status text check (status in ('pending','approved','rejected','sent')),
  reviewed_by uuid references staff(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid references staff(id),
  source_hospital text,
  healthlink_message_id text,
  results_json jsonb,
  abnormal_flags text[],
  gp_reviewed boolean default false,
  gp_comment text,
  delivery_method text check (delivery_method in ('sile','call','app','none')),
  delivered_at timestamptz,
  received_at timestamptz default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid references staff(id),
  consultation_id uuid references consultations(id),
  specialty text,
  hospital text,
  healthlink_ref text,
  status text,
  sile_drafted boolean default false
);

create table if not exists cdm_enrolments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  condition text,
  enrolled_date date,
  consent_signed boolean,
  status text
);

create table if not exists cdm_reviews (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  enrolment_id uuid references cdm_enrolments(id),
  reviewer_id uuid references staff(id),
  review_type text check (review_type in ('nurse','gp')),
  review_data_json jsonb,
  cdr_submitted boolean default false,
  cdr_submission_id text,
  pcrs_claim_id uuid,
  completed_at timestamptz,
  nurse_signed boolean default false,
  gp_signed boolean default false
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id),
  patient_id uuid not null references patients(id),
  staff_id uuid not null references staff(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  type text,
  status text,
  booked_via text,
  sile_triage_notes text,
  reminder_sent boolean default false
);

create table if not exists waiting_room (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id),
  arrived_at timestamptz,
  called_in_at timestamptz,
  completed_at timestamptz,
  wait_minutes int
);

create index if not exists idx_appointments_practice_start on appointments(practice_id, start_time);
create index if not exists idx_consultations_patient on consultations(patient_id);
create index if not exists idx_lab_results_patient on lab_results(patient_id);
