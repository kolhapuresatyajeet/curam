# Cúram — Build Plan & Cursor Instructions

## Lovable → Cursor Workflow

**Yes, Lovable and Cursor work together perfectly.** The workflow is:

1. **Lovable** — Build and iterate on UI/UX. Lovable generates React + TypeScript + Tailwind + Supabase code. Your Lovable preview at `id-preview--8e12a1fc-c535-49d0-8227-8c43d1f9f4d9.lovable.app` is your design source of truth.

2. **GitHub sync** — In Lovable, connect your project to GitHub. Code syncs in real time to your repo. Every Lovable edit creates a commit.

3. **Cursor** — Clone the repo locally. Open in Cursor. Now you have AI-powered coding on top of Lovable's generated UI. You edit backend logic, add integrations, fix edge cases, build the HealthLink bridge agent — all in Cursor.

4. **Two-way sync** — Push changes from Cursor → GitHub → Lovable picks them up. Push from Lovable → GitHub → Pull in Cursor. Keep both tools in the loop.

**Rule: Use Lovable for UI iterations. Use Cursor for backend, integrations, and production hardening.**

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React 18+ / TypeScript / Tailwind CSS | Lovable generates this natively. Component library already built. |
| **Backend** | Supabase (PostgreSQL + Edge Functions + Auth + Storage) | Lovable integrates natively. Handles auth, database, file storage, real-time subscriptions. EU region available (Frankfurt). |
| **API layer** | Supabase Edge Functions (Deno) + separate Node.js API for integrations | Edge functions for simple CRUD. Dedicated API server for HealthLink bridge, Healthmail SMTP, Stripe webhooks. |
| **HealthLink bridge** | Electron or Node.js desktop agent (local install at practice) | Runs on practice PC. Holds HealthLink digital certificate. Pulls messages via web services. Pushes to Supabase via secure API. |
| **Healthmail** | Node.js with nodemailer (SMTP/IMAP) | Standard email integration. TLS connection to healthmail.ie mail servers. |
| **Stripe** | Stripe SDK (stripe-js frontend + stripe Node.js backend) | Payments, payment links, Stripe Terminal for in-practice card payments. |
| **AI Scribe** | Whisper API (speech-to-text) + Claude API (note structuring) | Ambient transcription → structured SOAP note. All processing within EU. |
| **AI Voice (Síle)** | Vapi.ai or Bland.ai or Retell.ai | Voice AI platform for inbound/outbound calls. Connects to your API for appointment booking, results delivery. |
| **SMS** | Twilio or MessageBird | Appointment reminders, payment links, CDM recalls. Irish phone numbers. |
| **Hosting** | Supabase Cloud (EU) + Vercel (frontend) or Cloudflare Pages | GDPR-compliant EU hosting. Supabase has Frankfurt region. |
| **Mobile (patient app)** | React Native or Expo | Share component logic with web. iOS + Android for MyCúram patient app. |
| **Monitoring** | Sentry (error tracking) + PostHog (analytics) | Both have EU hosting options. |

---

## Supabase Database Schema (Core Tables)

```
-- Core
practices (id, name, address, eircode, phone, healthlink_id, healthmail, pcrs_reg, stripe_account_id)
staff (id, practice_id, name, role [gp|nurse|pm|receptionist|hca|locum], email, phone, sessions, permissions)
patients (id, practice_id, first_name, last_name, dob, gender, pps_number, gms_number, ihi_number, medical_card_type, phone, email, address, eircode, pharmacy_name, pharmacy_healthmail, allergies, smoking_status, created_at)
patient_conditions (id, patient_id, condition_code, condition_name, coding_system [icpc2|icd10|snomed], status [active|resolved], diagnosed_date)

-- Clinical
consultations (id, patient_id, staff_id, appointment_id, template_type, subjective, objective, assessment, plan, icpc2_codes[], ai_scribe_used, ai_transcript, status [draft|signed], signed_at)
prescriptions (id, patient_id, staff_id, consultation_id, drug_name, dose, frequency, duration_months, pharmacy_healthmail, healthmail_sent_at, status [active|expired|cancelled], refills_remaining)
repeat_rx_requests (id, patient_id, prescription_id, requested_via [app|sile|reception], status [pending|approved|rejected|sent], reviewed_by, reviewed_at)
lab_results (id, patient_id, staff_id, source_hospital, healthlink_message_id, results_json, abnormal_flags[], gp_reviewed, gp_comment, delivery_method [sile|call|app|none], delivered_at)
referrals (id, patient_id, staff_id, consultation_id, specialty, hospital, healthlink_ref, status [draft|sent|acknowledged|appointment_given|under_care|discharged], sile_drafted)

-- CDM
cdm_enrolments (id, patient_id, condition, enrolled_date, consent_signed, status [active|withdrawn])
cdm_reviews (id, patient_id, enrolment_id, reviewer_id [nurse or gp], review_type [nurse|gp], review_data_json, cdr_submitted, cdr_submission_id, pcrs_claim_id, completed_at)

-- Scheduling
appointments (id, practice_id, patient_id, staff_id, start_time, end_time, type [routine|urgent|cdm|nurse|phone|video|home_visit|vaccination], status [scheduled|confirmed|checked_in|in_progress|completed|dna|cancelled], booked_via [online|reception|sile], sile_triage_notes, reminder_sent)
waiting_room (id, appointment_id, arrived_at, called_in_at, completed_at, wait_minutes)

-- Billing
invoices (id, practice_id, patient_id, appointment_id, staff_id, billing_source [gms|private|vhi|laya|irish_life|aviva], amount, paid_amount, status [unbilled|invoiced|paid|partial|rejected], pcrs_claim_id, insurer_claim_ref, stripe_payment_id)
pcrs_claims (id, practice_id, patient_id, invoice_id, stc_code, submission_date, status [staged|submitted|accepted|rejected|paid], rejection_reason)

-- Messaging
inbox_messages (id, practice_id, channel [healthlink|healthmail|patient_app|sile_draft|internal], from_name, from_address, patient_id, subject, body, message_type [lab_result|discharge|referral_ack|radiology|patient_msg|healthmail|sile_draft|internal], assigned_to, read, urgent, received_at)
sms_log (id, patient_id, direction [outbound|inbound], message, status [sent|delivered|failed], sent_at)

-- Workflows
workflow_definitions (id, practice_id, name, trigger_event, conditions_json, actions_json, active, run_count)
workflow_runs (id, workflow_id, patient_id, trigger_data, actions_executed, result, ran_at)

-- AI / Síle
sile_calls (id, practice_id, patient_id, direction [inbound|outbound], purpose [booking|results|cdm_recall|payment|other], transcript, outcome, duration_seconds, recording_url, created_at)

-- Audit
audit_log (id, practice_id, user_id, action, entity_type, entity_id, patient_id, details_json, ip_address, created_at)
```

---

## Cursor Rules File (.cursorrules)

Create this file in your project root so Cursor understands the project context:

```
# Cúram — Irish GP Practice Management Platform

## Project context
You are building Cúram, an AI-first GP practice management platform for Irish general practice. The product serves GPs, practice nurses, receptionists, and practice managers in Ireland. It integrates with Irish healthcare systems (HealthLink, Healthmail, PCRS) and Irish health insurers (VHI, Laya, Irish Life, Aviva).

## Tech stack
- Frontend: React 18, TypeScript, Tailwind CSS, shadcn/ui components
- Backend: Supabase (PostgreSQL, Edge Functions, Auth, Storage, Realtime)
- Integrations: Stripe (payments), Nodemailer (Healthmail SMTP), Vapi.ai (voice AI)
- AI: Whisper (transcription), Claude API (note structuring)
- Deployment: Vercel (frontend), Supabase Cloud EU (backend)
- Mobile: React Native / Expo (patient app — MyCúram)

## Architecture principles
- All patient data must stay in EU (Supabase Frankfurt region)
- Every database mutation must write to audit_log (HIQA compliance)
- Row-Level Security (RLS) on all tables — staff only see their practice's data
- Role-based access: gp, nurse, pm, receptionist, hca, locum
- All AI-generated content (notes, letters, referrals) requires human approval before saving
- Offline-first for consultation workflow (service worker + IndexedDB)

## Irish healthcare specifics
- GMS = General Medical Services (public/medical card patients)
- PCRS = Primary Care Reimbursement Service (processes GMS claims)
- HealthLink = national clinical messaging (HL7 v2.4 XML messages)
- Healthmail = secure email (@healthmail.ie) for prescriptions and clinical comms
- CDM = Chronic Disease Management programme (diabetes, COPD, asthma, CVD)
- IHI = Individual Health Identifier (18-digit number)
- STC = Special Type Consultation (PCRS claim codes)
- ICPC-2 = clinical coding system used in Irish general practice
- GPIT = GP IT accreditation body (under ICGP)

## Coding standards
- Use TypeScript strict mode
- Components in /src/components/{feature}/
- Pages in /src/pages/
- Supabase functions in /supabase/functions/
- API types generated from Supabase schema
- Use React Query (TanStack Query) for data fetching
- Use Zustand for client state
- All dates in ISO 8601, display in dd/MM/yyyy (Irish format)
- Currency always EUR, format: €X,XXX.XX
- Phone numbers in Irish format: 08X XXX XXXX

## Key domain rules
- Lab results marked "abnormal" can NEVER be delivered by AI — only GP callback
- Prescriptions require GP approval (never auto-approved)
- CDM reviews require both nurse review AND GP review
- GDPR: patient records retained 8 years (adults), until age 25 (children)
- All Síle AI voice calls must be logged with recording and transcript
- Emergency detection: if patient mentions chest pain, breathing difficulty → instruct to call 999/112
```

---

## Folder Structure

```
curam/
├── .cursorrules                    # Cursor context (above)
├── .env.local                      # Environment variables
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts                  # or next.config.ts if using Next.js
│
├── src/
│   ├── app/                        # App shell, routing, layouts
│   │   ├── layout.tsx              # Main layout with sidebar
│   │   ├── (auth)/                 # Auth pages (login, register)
│   │   └── (dashboard)/            # Authenticated pages
│   │       ├── dashboard/
│   │       ├── calendar/
│   │       ├── inbox/
│   │       ├── patients/
│   │       ├── patient/[id]/       # Patient record with tab routing
│   │       ├── prescriptions/
│   │       ├── cdm/
│   │       ├── referrals/
│   │       ├── billing/
│   │       ├── sile/
│   │       ├── insights/
│   │       ├── staff/
│   │       ├── workflows/
│   │       └── settings/
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui base components
│   │   ├── layout/                 # Sidebar, TopBar, PageHeader
│   │   ├── dashboard/              # Dashboard widgets
│   │   ├── calendar/               # Multi-practitioner calendar
│   │   ├── inbox/                  # Inbox list, message detail
│   │   ├── patient/                # PatientHeader, PatientTabs, Timeline
│   │   ├── consultation/           # SOAPNote, AIScribe, QuickActions
│   │   ├── prescriptions/          # RxQueue, RxPad, DrugSearch
│   │   ├── cdm/                    # CDMDashboard, ReviewForm
│   │   ├── billing/                # BillingTable, ClaimSubmission
│   │   ├── sile/                   # SileDashboard, CallLog, Config
│   │   └── shared/                 # Avatar, Tag, MetricCard, etc.
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── usePatient.ts
│   │   ├── useAppointments.ts
│   │   ├── useInbox.ts
│   │   ├── usePrescriptions.ts
│   │   └── useAuth.ts
│   │
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client
│   │   ├── stripe.ts               # Stripe client
│   │   ├── healthmail.ts           # SMTP/IMAP client
│   │   ├── sile.ts                 # Voice AI client
│   │   ├── audit.ts                # Audit log helper
│   │   ├── permissions.ts          # Role-based access
│   │   └── utils.ts                # Formatters, validators
│   │
│   ├── types/
│   │   ├── database.ts             # Generated from Supabase schema
│   │   ├── healthlink.ts           # HL7 message types
│   │   └── domain.ts               # Business domain types
│   │
│   └── stores/
│       ├── authStore.ts            # Zustand auth state
│       ├── practiceStore.ts        # Current practice context
│       └── consultationStore.ts    # Active consultation state
│
├── supabase/
│   ├── migrations/                 # SQL migrations
│   │   ├── 001_core_tables.sql
│   │   ├── 002_clinical_tables.sql
│   │   ├── 003_billing_tables.sql
│   │   ├── 004_messaging_tables.sql
│   │   ├── 005_rls_policies.sql
│   │   └── 006_audit_trigger.sql
│   │
│   └── functions/
│       ├── stripe-webhook/         # Payment confirmations
│       ├── sile-webhook/           # Voice AI call events
│       ├── healthlink-ingest/      # Receive from bridge agent
│       ├── send-healthmail/        # Send prescriptions
│       ├── pcrs-claim/             # Generate PCRS claim files
│       ├── workflow-engine/        # Process workflow triggers
│       └── ai-scribe/              # Transcription → SOAP note
│
├── bridge-agent/                   # HealthLink local bridge (separate app)
│   ├── package.json
│   ├── src/
│   │   ├── main.ts                 # Electron main process
│   │   ├── healthlink-client.ts    # HL7 web service calls using practice certificate
│   │   ├── message-parser.ts       # HL7 v2.4 XML parsing
│   │   ├── api-sync.ts             # Push parsed messages to Supabase
│   │   └── certificate-manager.ts  # Handle HealthLink digital certificate
│   └── electron-builder.yml
│
└── mobile/                         # MyCúram patient app
    ├── app/
    ├── components/
    └── package.json
```

---

## Phase 1 — Core Platform (Weeks 1-8)

### Sprint 1-2: Foundation (Weeks 1-4)

**Cursor prompt:**
```
Set up the Cúram project using the Lovable-generated React/TypeScript/Tailwind code from GitHub. Add Supabase integration with the core database schema. Implement:

1. Authentication (Supabase Auth) with email/password login
2. Practice setup flow (practice name, address, staff)
3. Staff management with roles (gp, nurse, pm, receptionist)
4. Role-based sidebar navigation — GP sees 13 items, nurse sees 7, PM sees 9, receptionist sees 5
5. Audit log trigger — every INSERT/UPDATE/DELETE writes to audit_log automatically
6. Row-Level Security policies — staff can only see data from their own practice

Use the Lovable UI components as the design foundation. Keep the dark sidebar with grouped navigation.
```

### Sprint 3-4: Patient Records + Scheduling (Weeks 5-8)

**Cursor prompt:**
```
Build the patient management and scheduling modules:

1. Patient registration form — first name, surname, DOB, gender, PPS, GMS number, IHI, medical card type, phone, email, address, eircode, pharmacy name + healthmail, allergies, smoking status, GDPR consent, Síle AI consent
2. Patient list with tabs (All / GMS panel / CDM enrolled / Recent) and search
3. Patient record with 9 tabs: Summary, Timeline, Consultation, Prescriptions, Results, Referrals, CDM, Vaccines, Documents
4. Multi-practitioner appointment calendar — day view with side-by-side columns per practitioner, colour-coded appointment types
5. Online booking page (public URL) with triage questions
6. Appointment reminder system — schedule SMS via Twilio at 48hr and 2hr before
7. Waiting room screen — check-in, wait time tracking, call-in button
8. Consultation note editor — SOAP format with template selector (GP consult, phone triage, nurse clinic, home visit)

All patient data operations must go through audit_log. Irish date format (dd/MM/yyyy). Phone format (08X XXX XXXX).
```

---

## Phase 2 — Payments + Healthmail (Weeks 9-14)

### Sprint 5-6: Stripe + Billing (Weeks 9-12)

**Cursor prompt:**
```
Implement the billing and payments module:

1. Stripe Connect setup — each practice has a Stripe account
2. In-practice card payments via Stripe Terminal (BBPOS WisePOS E reader)
3. Payment link generation — for SMS/email to patients with outstanding balances
4. Invoice generation from completed appointments — auto-detect billing source (GMS, private, VHI, Laya, Irish Life, Aviva)
5. Billing overview screen with Carepatron-style data table — columns: date, time, client, payment type, billed, unpaid, paid, items, provider, status
6. Filter chips (clients, team, billing method, invoice status)
7. Daily reconciliation — match payments to appointments
8. Receipt PDF generation
9. Stripe webhook handler — update invoice status on payment confirmation
10. Outstanding balance tracking with aging (7, 14, 21, 30 days)
```

### Sprint 7: Healthmail Integration (Weeks 13-14)

**Cursor prompt:**
```
Implement Healthmail integration for electronic prescriptions:

1. SMTP client using nodemailer — connect to healthmail.ie mail servers with TLS
2. Practice Healthmail config in settings — store IMAP/SMTP credentials securely (encrypted in Supabase vault)
3. Prescription send flow: GP approves Rx → system formats prescription email → sends via Healthmail to patient's nominated pharmacy
4. IMAP client to receive incoming Healthmail messages — pharmacy queries, colleague correspondence
5. Auto-file incoming Healthmail to patient record (match by patient name/DOB in email body)
6. Healthmail directory — searchable list of @healthmail.ie addresses for pharmacies and colleagues
7. Outbox with delivery confirmation tracking

Security: Healthmail credentials never leave the server. TLS required. All emails logged in audit trail.
```

---

## Phase 3 — AI Features (Weeks 15-20)

### Sprint 8-9: AI Scribe + Síle Voice (Weeks 15-18)

**Cursor prompt:**
```
Implement AI clinical features:

AI SCRIBE:
1. Browser-based audio capture during consultation (with patient consent toggle)
2. Real-time transcription using Whisper API (stream audio chunks)
3. Live transcript display in right panel of consultation view
4. On consultation end: send transcript to Claude API with prompt to generate structured SOAP note
5. Claude prompt should include: patient's active conditions, medications, allergies, recent consultations for context
6. GP reviews AI-generated SOAP note, edits if needed, approves with one click
7. Auto-suggest ICPC-2 codes based on note content
8. All AI processing must use EU-hosted endpoints

SÍLE VOICE AGENT:
1. Integrate with Vapi.ai (or Retell.ai) for voice AI
2. Inbound call handling: answer practice phone, identify patient by name+DOB, ask reason for call, perform triage screening (red flag questions), check real-time appointment availability, book appointment, send SMS confirmation
3. Outbound result delivery: when GP marks result as "normal - Síle can deliver", queue outbound call. Síle calls patient, delivers result in natural Irish English, logs call in patient record
4. Outbound CDM recall: identify overdue patients, call them, offer appointment slot, book directly
5. Emergency detection: if caller describes chest pain, difficulty breathing → "Please hang up and call 999 or 112"
6. All calls recorded and transcribed. Recordings stored encrypted in Supabase Storage.
7. Síle dashboard: call log, resolution rate, live calls, performance metrics
```

### Sprint 10: Workflows Engine (Weeks 19-20)

**Cursor prompt:**
```
Build the workflow automation engine:

1. Event-driven architecture — listen to database changes (Supabase Realtime) and trigger workflows
2. Workflow definition model: trigger_event + conditions + actions chain
3. Pre-built workflows (create as seed data):
   - Appointment created → send SMS confirmation
   - 48hr before appointment → send SMS reminder
   - No-show marked → send "sorry we missed you" SMS
   - Lab result received → route to ordering GP
   - GP marks result as normal → queue Síle delivery call
   - Patient requests repeat Rx → add to GP review queue
   - CDM review due in 2 weeks → start recall sequence (SMS → app → Síle call)
   - Invoice unpaid 7 days → send payment link SMS
4. Workflow admin UI: list all workflows, active/inactive toggle, run count, edit actions
5. Run history: timestamped log of every workflow execution
6. Error handling: if any action fails, log error and continue chain
```

---

## Phase 4 — HealthLink Bridge (Weeks 21-26)

### Sprint 11-13: HealthLink Bridge Agent (Weeks 21-26)

**Cursor prompt:**
```
Build the HealthLink bridge agent as a separate Electron app:

1. Electron app that installs on the practice's Windows PC (where HealthLink certificate lives)
2. On first launch: detect HealthLink digital certificate in Windows certificate store
3. Authenticate with HealthLink Online web services using the practice's certificate
4. Poll for new messages every 60 seconds (lab results, discharge summaries, referral acks, radiology reports)
5. Parse HL7 v2.4 XML messages:
   - ORU messages (lab results) → extract test names, values, reference ranges, flags
   - ADT messages (discharge summaries) → extract diagnosis, medications, follow-up
   - REF messages (referral acknowledgements) → extract status, appointment date
6. Push parsed messages to Supabase via secure API (JWT-authenticated)
7. Handle outbound eReferrals: receive referral data from Supabase, format as HL7, submit via HealthLink web services
8. System tray icon with status indicator (connected/disconnected/error)
9. Auto-update mechanism (check for new versions on startup)
10. Logging: all HealthLink interactions logged locally and to Supabase

The bridge agent must be lightweight, run in background, and auto-start with Windows.
Create an installer using electron-builder for Windows (.exe).
```

---

## Phase 5 — CDM + Insurer Billing (Weeks 27-34)

### Sprint 14-15: CDM Programme (Weeks 27-30)

**Cursor prompt:**
```
Build the CDM (Chronic Disease Management) programme module:

1. CDM dashboard with metrics: enrolled count, due this month, completed, revenue, coverage %
2. Patient eligibility auto-detection: GMS/GP visit card holders aged 18+ with qualifying conditions
3. CDM enrolment workflow: identify → consent → enrol → schedule first review
4. Structured review forms per condition:
   - Diabetes T2: HbA1c, fasting glucose, BP, BMI, foot exam, retinal screening status, lifestyle assessment, self-management goals
   - COPD: spirometry, MRC dyspnoea scale, inhaler technique, exacerbation count, smoking status
   - Asthma: ACT score, peak flow, triggers, preventer compliance, action plan
   - Cardiovascular (HF, IHD, Stroke/TIA, AF): BP, lipids, anticoagulation, exercise capacity, NYHA class
5. Two-stage review workflow: nurse completes clinical measurements → GP reviews and signs off
6. CDM recall engine: identify overdue patients → SMS → app notification → Síle call → auto-book
7. CDR submission: format completed review data and submit to HSE Clinical Data Repository (this will initially be manual export, then automated when HealthLink bridge supports it)
8. PCRS claim auto-generation: on successful CDM review, create billing entry with correct STC code
```

### Sprint 16-17: Insurer Billing (Weeks 31-34)

**Cursor prompt:**
```
Build insurer claim management for VHI, Laya, Irish Life Health, Aviva:

1. Insurer configuration in settings — store provider registration details per insurer
2. Claim generation per insurer format:
   - VHI: structured data fields (updated format since 2024). Generate claim with patient VHI member number, procedure code, diagnosis, amount
   - Laya: separate claim format. Member number, claim type, dates, amounts
   - Irish Life Health: their specific format
   - Aviva: their specific format
3. Batch claim generation — select date range, generate all unsent claims per insurer
4. Claim status tracking: staged → submitted → processing → paid/rejected
5. Rejection handling: display rejection reason, allow resubmission after correction
6. Insurer claims tab in billing: filtered by insurer, with totals and aging
7. Patient eligibility notes: flag if patient's insurer plan covers the consultation type

Note: Initial implementation may require manual upload to insurer portals. Build the claim file generation; portal automation comes later.
```

---

## Phase 6 — Patient App + Polish (Weeks 35-42)

### Sprint 18-19: MyCúram Patient App (Weeks 35-38)

**Cursor prompt:**
```
Build the MyCúram patient app using React Native / Expo:

1. Patient authentication (Supabase Auth with magic link or password)
2. Home screen: next appointment, quick actions (book, repeat Rx, results, message)
3. Appointment booking: show available slots, select practitioner, book with confirmation
4. Repeat prescription requests: show active medications with tick boxes, select pharmacy, submit request
5. Results viewing: lab results with GP commentary. Normal results shown directly. Abnormal results show "Please contact the practice"
6. Secure messaging: two-way messaging with the practice. Read receipts.
7. CDM self-management: view care plan, log glucose readings (diabetes), symptom tracking
8. Profile management: update phone, email, address, pharmacy preference
9. Push notifications for appointment reminders, new results, messages

Design for elderly patients: 18px minimum font, high contrast, large touch targets (48px), no swipe gestures. Everything is a tap.
```

### Sprint 20-21: Production Hardening (Weeks 39-42)

**Cursor prompt:**
```
Production readiness checklist:

1. GDPR compliance:
   - Data export (patient can request all their data as JSON/PDF)
   - Right to erasure workflow (with retention period validation — can't delete within 8 years for adults)
   - Cookie consent on patient-facing pages
   - Data processing register page in settings
   - Breach notification template and workflow

2. Security:
   - 2FA for all staff accounts (Supabase Auth supports TOTP)
   - Session timeout (configurable, default 30 minutes)
   - IP allowlisting option for practices
   - Password policy enforcement (min 12 chars, complexity)
   - All API endpoints rate-limited

3. Performance:
   - Database indexes on all foreign keys and frequently queried columns
   - Pagination on all list views (patients, appointments, inbox, billing)
   - Image/document compression before storage
   - CDN for static assets

4. Offline support:
   - Service worker for consultation workflow
   - IndexedDB cache for current patient data
   - Queue outbound actions (save note, send Rx) for sync when online

5. Observability:
   - Sentry error tracking (EU region)
   - PostHog analytics (EU region)
   - Uptime monitoring for Supabase, Stripe, Healthmail, HealthLink bridge
```

---

## Phase 7 — GPIT Accreditation (Months 10-24, parallel)

This runs in parallel with development:

1. **Month 10** — Contact ICGP GPIT Group. Express interest in accreditation. Share product demo.
2. **Month 12** — Complete self-assessment against GPIT specification. Document compliance.
3. **Month 14** — Begin pre-integration testing with GPIT. Core functionality review.
4. **Month 16** — HealthLink formal integration testing (bridge agent → native migration).
5. **Month 18** — PCRS integration testing. GMS panel management, STC claims.
6. **Month 20** — Post-integration end-to-end testing.
7. **Month 22-24** — Accreditation decision. If successful, announce to market.

**While awaiting accreditation, target private-only GP practices and mixed practices willing to run Cúram alongside Socrates for private patients.**

---

## Environment Variables (.env.local)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Healthmail SMTP (per practice — stored in Supabase, not env)
# HEALTHMAIL_SMTP_HOST=smtp.healthmail.ie
# HEALTHMAIL_IMAP_HOST=imap.healthmail.ie

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # for Whisper transcription

# Voice AI (Síle)
VAPI_API_KEY=...

# SMS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+353...

# Bridge Agent API
BRIDGE_API_KEY=...  # JWT secret for bridge agent auth
```

---

## Key Cursor Commands for Development

Start each coding session with context:

```
@codebase What is the current state of the patient record module? What's implemented and what's missing?
```

For new features, reference the schema:

```
@file:supabase/migrations/001_core_tables.sql Build a React component for the patient registration form that writes to the patients table. Include all fields. Use Supabase client for insertion. Show success/error feedback.
```

For UI matching Lovable designs:

```
@file:src/components/layout/Sidebar.tsx Update the sidebar to match the Lovable design — dark background (#1b2030), grouped navigation with section labels, role-based visibility, integration status indicators at bottom.
```

For integrations:

```
@docs:https://stripe.com/docs/api Implement the Stripe payment flow: create payment intent on consultation completion, handle webhook for payment confirmation, update invoice status.
```

---

## Timeline Summary

| Phase | Weeks | What ships |
|---|---|---|
| 1 — Core platform | 1-8 | Auth, patients, scheduling, consultation notes, waiting room |
| 2 — Payments + Healthmail | 9-14 | Stripe billing, Healthmail prescriptions, invoice management |
| 3 — AI features | 15-20 | AI scribe, Síle voice agent, workflow engine |
| 4 — HealthLink bridge | 21-26 | Local bridge agent, lab results, discharge summaries |
| 5 — CDM + insurers | 27-34 | CDM programme, VHI/Laya/Irish Life/Aviva claims |
| 6 — Patient app + polish | 35-42 | MyCúram mobile app, GDPR, security hardening, offline |
| 7 — GPIT accreditation | Months 10-24 | Parallel process for GMS market access |

**Total to MVP: ~10 months. Total to full market: ~24 months.**
