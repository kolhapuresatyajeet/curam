# Cúram — Testing Guide

How to test every feature of the platform, from zero setup to the parts that
need external accounts. Order matters: sections build on earlier ones.

---

## 0. Start the platform

```bash
# Staff web app → http://localhost:5173
npm run dev

# Patient app (second terminal) → scan QR with Expo Go
cd patient-app && npm start

# HealthLink bridge (third terminal, optional)
cd bridge-agent && npm run build && npx electron .
```

Typecheck everything:

```bash
./node_modules/.bin/tsc -p tsconfig.json --noEmit   # web
cd bridge-agent && tsc -p tsconfig.json             # bridge
cd patient-app && tsc -p tsconfig.json --noEmit     # patient app
```

---

## 1. Works right now — no external accounts needed

### 1.1 Practice bootstrap + auth

1. Open the web app → `/setup`
2. Create a practice (name, address, Eircode…) + your GP account
3. **Expect**: redirect lands on the dashboard (not stuck on setup) — this was
   the signup-redirect fix; sign out and back in to confirm repeat logins work

### 1.2 Staff invites

1. Settings → add a staff member (e.g. nurse@testpractice.ie)
2. **Expect**: row shows "Invite pending"
3. In a private/incognito window: sign up with that email → on first sign-in
   the row links to the account (`claim_staff_slot`) and "pending" clears

### 1.3 Appointments + waiting room

1. Book an appointment for a patient (pick nurse + GP)
2. **Expect**: confirmation, appears in Calendar; push to waiting room on
   arrival; complete it

### 1.4 Billing + receipt generator

1. Book a *private* appointment and complete it
2. **Expect**: invoice auto-created by the DB trigger (practice_fees rates)
3. Billing → Overview → "Cash / in-room" → mark paid
4. Click **Receipt** → A5 print preview opens with practice letterhead,
   masked PPS, amount, payment method → "Save as PDF"
5. Billing → **Insurer claims** tab → "Coming soon" banner + receipt guidance
6. GMS appointments: **expect** *no* invoice (GMS is PCRS-claimed, not billed)

### 1.5 CDM programme (the full loop)

1. On a GMS patient record (18+, e.g. born 1970) → note their email/conditions
2. CDM → **Eligible** tab → patient listed (GMS + has condition + not enrolled)
3. Click **Enrol** → appears in Enrolments with next review date (+1 month)
4. Click **Start review** → nurse review form (HbA1c/BP/BMI for diabetes…) →
   fill values → **Nurse sign**
5. Sign out, sign in as the GP (role matters) → Reviews due → **GP sign-off**
6. **Expect**: review Completed; **PCRS claims** tab (Billing) shows a staged
   claim; enrolment's next review date moved +6 months

### 1.6 Workflows engine

1. Workflows page → definitions loaded from DB (No-show follow-up, Lab routing,
   Invoice unpaid, CDM recall — some seeded active)
2. Toggle one off → on again → **Expect**: optimistic toggle, run history table
3. DNA test: book an appointment, mark it **DNA** in the waiting room
4. **Expect**: within ~5 min the workflow engine logs a run (check workflow_runs)

### 1.7 Patient app (local)

1. Put your Supabase **anon key** in `patient-app/app.json` → `extra.supabaseAnonKey`
2. In the staff app, make sure a test patient has your email on file
3. Expo Go → sign in with that email (magic link)
4. **Expect**: home shows your next appointment; Book makes a real appointment
   (booked_via='online'); Log saves a glucose reading
5. **GDPR**: send yourself a message, then check `patient-data-export`:
   ```bash
   curl -H "Authorization: Bearer <patient-token>" \
     https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/patient-data-export
   ```
   → JSON with every table's rows for that patient

### 1.8 RLS isolation (security)

1. Sign in as practice A staff → note a patient ID
2. As practice B (second test practice), try opening that patient via URL/record
3. **Expect**: not found / empty — practices cannot see each other
4. Patient app can only see its own rows (try a query in Supabase's SQL editor
   as the patient JWT: `select * from lab_results` → own rows only)

---

## 2. Needs external accounts (enable one at a time)

### 2.1 AI Scribe — via LiteLLM (recommended) or direct keys

LiteLLM gateway (one key, model routing/fallbacks, spend tracking). Host it in
the EU (self-hosted Docker, or EU-hosted proxy) to keep data residency:

```bash
supabase secrets set LITELLM_BASE_URL=https://litellm.yourdomain.eu \
  LITELLM_API_KEY=sk-litellm-...
# Optional overrides (use your LiteLLM model names — provider prefixes depend
# on your LiteLLM router config, e.g. anthropic/claude-haiku-4-5):
# supabase secrets set AI_TRANSCRIBE_MODEL=openai/gpt-4o-mini-transcribe \
#   AI_STRUCTURE_MODEL=anthropic/claude-haiku-4-5
```

Or direct provider keys (fallback path, no gateway):

```bash
supabase secrets set OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-...
```

Test: start a consultation → record a sentence ("patient has a sore throat for
three days, no fever") → stop → **Expect**: SOAP draft appears; check
`ai_usage_log` has a metered row (and LiteLLM's own spend dashboard shows the
same call). Monthly cap (`AI_MONTHLY_CAP_CENTS`, default 500) blocks with a
clear error when exceeded.

Gateway-only connectivity check (models list, chat, /v1/messages, audio):

```bash
LITELLM_BASE_URL=https://… LITELLM_API_KEY=sk-… ./scripts/test-litellm.sh
```

### 2.2 SMS — needs Twilio account + number

```bash
supabase secrets set SMS_ENABLED=true TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=+353...
```

Test: book an appointment → **Expect**: SMS confirmation arrives; a cron tick
(≤15 min) sends the 48h reminder. `sms_log` records both. Twilio trial accounts
only text verified numbers — verify your own phone in the Twilio console.

### 2.3 Stripe — Connect (per-practice) + webhook

Stripe runs on the platform's test keys; each practice connects its **own**
Stripe Express account from Settings → Stripe ("Connect Stripe"). No per-practice
key entry anywhere.

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
# local webhook relay:
stripe listen --forward-to https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/stripe-webhook
```

Test: Settings → Connect Stripe → complete Express onboarding (test IBAN
`IE89370400440532013000`) → return to `/settings?stripe=return` → **Expect**:
status "connected", `practices.stripe_account_id` set. Billing → payment link
on an unpaid private invoice → pay with test card `4242 4242 4242 4242` →
**Expect**: webhook flips invoice to paid + `invoice.payment_recorded` audit row.

### 2.4 Healthmail — needs a real @healthmail.ie account

```bash
supabase secrets set HEALTHMAIL_ENABLED=true
```

Test: Settings → connect clinician's Healthmail password → prescriptions →
send an approved prescription to a pharmacy address → **Expect**: pharmacy
receives it from the prescriber's own address. (Verify IMAP/SMTP access with
Healthmail support first — that's why the flag starts off.)

---

## 3. HealthLink bridge (testable without HealthLink!)

The real endpoint arrives at formal integration testing (month 16), but every
moving part is testable today because the ingest API is the contract.

### 3.1 Register the agent

```bash
curl -X POST https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/healthlink-ingest \
  -H 'Content-Type: application/json' \
  -H 'x-bridge-key: <BRIDGE_API_KEY>' \
  -d '{"action":"register","practice_id":"<practice-uuid>","hostname":"test-mac","version":"0.1.0"}'
# → {"ok":true,"agent_id":"…","agent_key":"hlb-agent-…"} — save the agent key
```

### 3.2 Simulate an inbound lab result (ORU)

```bash
curl -X POST https://duphvinfwkskjkfqaetr.supabase.co/functions/v1/healthlink-ingest \
  -H 'Content-Type: application/json' -H 'x-bridge-key: <AGENT_KEY>' \
  -d '{"action":"ingest","messages":[{"type":"ORU","healthlink_message_id":"TEST-001",
    "source_hospital":"St. James","patient":{"ihi":"<patient-ihi-or-use-patient_id>"},
    "results":[{"test_name":"HbA1c","value":"42","units":"mmol/mol","reference_range":"20-40"}],
    "abnormal_flags":["HbA1c: H"],"summary":"HbA1c: 42 mmol/mol (ref 20-40)"}]}'
```

**Expect**: `lab_results` row (abnormal → `delivery_method='call'`), urgent
inbox entry, `healthlink_messages` audit rows (received → parsed), and a
workflow `lab_result_received` event. Repeat with an empty
`abnormal_flags` → **Expect**: normal result, no urgent flag.

### 3.3 Outbox round-trip

1. Staff web → referrals → queue one (bridge_status='queued')
2. `{"action":"outbox"}` with the agent key → **Expect**: referral returned
3. `{"action":"ack","referral_id":"…","healthlink_ref":"HL-TEST-1"}` →
   **Expect**: referral `submitted`, audit row written
4. Simulate the hospital's REF ack inbound (`type:"REF"`) → referral → `acked`

### 3.4 The Electron app itself

```bash
cd bridge-agent
# config: supabaseUrl, bridgeKey (per-agent), practiceId from 3.1
npm start
```

**Expect**: tray dot appears; `~/Library/Application Support/<name>/bridge.log`
shows heartbeat + poll loop ("endpoint not configured — skipping poll" is the
expected line until month 16). Leave it running and re-run 3.2/3.3 — the agent
does the calls instead of curl.

---

## 4. What cannot be tested yet

| Feature | Blocked on |
|---|---|
| Real HealthLink message flow | Formal integration testing (month 16) |
| VoiceHub calls end-to-end | VoiceHub (sister app) owns patient phone calls; Vapi.ai account + phone number live there. Síle surfaces its call insights in Cúram |
| WhatsApp reminders | Meta business verification + approved templates |
| Automated insurer claims | Deliberately deferred ("coming soon") |
| Sentry / PostHog / uptime | Account DSNs — wire up when created |

---

## 5. Test data hygiene

- Tests pollute production (duphvinfwkskjkfqaetr) — it's the dev project for
  now, but before go-live: create a staging project, move test data there
- Patients created for testing: mark clearly ("TEST-…") or delete (GDPR check
  applies in real use, not test data)
- "Reset demo data" only resets the local mock store (demo mode), **not**
  Supabase rows; on the live app the store boots blank and hydrates from the DB

---

## 6. Fresh onboarding E2E — deployed app (curam-phi.vercel.app)

Full smoke test from zero. Run in a **fresh incognito window** (or clear site
data) so an old service worker / stale localStorage can't interfere. Ready
before you start: two Google accounts (GP + invited staff), Stripe test card
`4242 4242 4242 4242`, and the latest deploy live on Vercel.

### Phase 1 — Onboarding

1. Open `https://curam-phi.vercel.app/` → **Expect**: redirect to `/login`
   (also proves the service-worker cache fix is live)
2. "Create a practice" → `/setup` → Continue with Google (returns to `/setup`)
3. Fill your name / practice name / address / Eircode / phone → Create practice
   → runs `bootstrap_practice`, you become the first GP
4. **Expect**: dashboard with **zero demo data** — no "Riverside Family
   Practice", no fake patients/invoices, all metrics zero (seed can only
   appear in demo mode without Supabase)

### Phase 2 — Staff & roles

1. Staff → invite a member (e.g. role Receptionist) with an exact Google email
   → **Expect**: "Invite pending" badge
2. Second incognito window: sign in with that account → slot claimed by email,
   pending clears → **Expect**: role-driven sidebar (receptionist sees no
   Prescriptions / CDM GP-review actions)

### Phase 3 — Patients & consultation

1. Patients → Register a test patient (name, DOB, `08X XXX XXXX` phone,
   GMS/private)
2. Open patient → Start consultation → dictate/type → AI structures SOAP +
   ICPC-2 → Sign (confirm dialog) → **Expect**: note permanent afterwards
3. Prescriptions → create repeat → GP Approve (confirm) → send to a
   `@healthmail.ie` pharmacy (connect your Healthmail account in Settings
   first — see §7 for testing without a real account)

### Phase 4 — Calendar & booking

1. Calendar → click an empty slot → booking modal prefilled (15-min rounding);
   check Day (per-clinician columns) / Week / Month and the red now-line
2. Settings → Google Calendar → Connect → **Expect**: appointment appears in
   your Google Calendar
3. Private window → public `/book` → book → **Expect**: appears on the
   calendar; confirmation email per §7 (blocked until the Resend domain is
   verified)
4. Waiting room → check the patient in

### Phase 5 — Billing (Stripe Connect)

1. Settings → Connect Stripe → Express onboarding with test data (IBAN
   `IE89370400440532013000`) → **Expect**: back at `/settings?stripe=return`,
   status connected
2. Billing → create private invoice → payment link → pay `4242 4242 4242 4242`
   → **Expect**: invoice paid via webhook + `invoice.payment_recorded` row in
   `audit_log`
3. GMS appointments → **Expect**: no invoice (PCRS-claimed)

### Phase 6 — Clinical programmes

1. CDM → enrol a GMS patient with a chronic condition → nurse review → GP
   review → **Expect**: both signatures required to complete
2. Referrals → create → Approve & send (confirm)
3. HealthLink → Labs tab filters (All / Abnormal / Awaiting review) →
   **Expect**: abnormal results only offer GP callback, never AI delivery

### Phase 7 — Síle AI, VoiceHub & compliance

1. VoiceHub (sister app) → test call → **Expect**: transcript + recording logged; call count surfaced on Síle's Briefing
2. Say "chest pain" → **Expect**: instructed to call 999/112
3. Supabase `audit_log` → entries for login, note signed, Rx approved, payment
   recorded, etc.
4. Settings → Export workspace (JSON) → GDPR export downloads
5. Sign out → protected routes redirect to `/login`

### Known external blockers (skip, don't fail)

| Flow | Blocked on |
|---|---|
| Booking/reminder emails | `mail.voicehub.uk` DNS verification at resend.com/domains |
| WhatsApp reminders | Approved Twilio Content Templates (+ number has no SMS capability) |

---

## 7. Email testing without real accounts (free)

### 7.1 Booking/confirmation emails (Resend) — works today

Resend free tier: 3,000 emails/month (100/day). Until `mail.voicehub.uk` is
verified, switch the sender to Resend's shared test address, which delivers
only to the Resend account owner's own email:

```bash
supabase secrets set RESEND_FROM="Cúram <onboarding@resend.dev>"
```

Test the whole book → confirmation → reminder loop sending to yourself.

### 7.2 Automated email test suite (repeatable — no accounts, no cloud changes)

```bash
npm run test:email                        # SMTP round-trips (no Supabase at all)
CURAM_LIVE_SMOKE=1 npm run test:email     # + deployed functions auth smoke
CURAM_FULL_LOOP=1 npm run test:email      # + full connect→send loop (local stack)
```

`tests/email/` (node:test) auto-generates a fresh free Ethereal account every
run — nothing to sign up for, nothing delivered to real recipients, every
captured message asserted via its preview URL:

- **Prescription email round-trip** — mirrors the `send-healthmail` transporter
  config + template verbatim (drug/dose/patient/prescriber/S.I. 94 of 2020
  footer all asserted)
- **Booking confirmation** — mirrors `booking-mail.ts` texts, asserts Dublin
  timezone rendering and booked/cancelled verb consistency
- **Live smoke** (opt-in) — deployed `healthmail-connect` /
  `send-booking-email` / `send-healthmail` must be up and reject
  unauthenticated calls (401/403)
- **Full loop** (opt-in, local stack only) — starts `supabase functions serve`
  against a running **local** Supabase stack (`supabase start`), creates a test
  practice/GP/patient/prescription in the local DB, connects an Ethereal
  address via the real `healthmail-connect`, sends via the real
  `send-healthmail`, asserts the DB side-effects, then deletes all rows

Test-only relaxation: `HEALTHMAIL_TEST_MODE=true` lives ONLY in
`tests/email/functions.test.env` (consumed by the local `functions serve`).
It is never set in Supabase cloud secrets, so production always enforces
`@healthmail.ie` strictly. If templates/transport change in the functions,
update the mirrors in the tests so the suite keeps guarding real behaviour.

### 7.3 Healthmail flow (SMTP/IMAP) — captured test inbox

Real `@healthmail.ie` accounts need GPIT accreditation, so testing uses
**Ethereal** (ethereal.email — by the Nodemailer team, unlimited captures, web
UI). Alternatives: Mailtrap (free sandbox, ~1k emails/month) or Mailpit (local
Docker, unlimited, dev only).

Two ways to exercise it — both scoped to tests, no cloud secrets:

1. **Automated** (preferred): `CURAM_FULL_LOOP=1 npm run test:email` (§7.2)
   drives the real `healthmail-connect` + `send-healthmail` functions served
   locally, with the test-only env file. Prerequisite: `supabase start`.
2. **Manual**: serve locally yourself and connect from the app UI:
   ```bash
   supabase start   # local stack (separate from the cloud project)
   supabase functions serve --env-file tests/email/functions.test.env
   # app .env.local: VITE_SUPABASE_URL points at the local URL, then
   # Settings → Connect Healthmail with the Ethereal address/password
   ```
   **Expect**: message captured in Ethereal's web inbox, never delivered to a
   real pharmacy.

Credentials are stored in `staff_healthmail_credentials` (RLS deny-all,
service-role only — migration 027). This replaced the Vault, which is unusable
on hosted Supabase (`vault_create_secret` is locked to `supabase_admin`).
TODO before go-live: envelope-encrypt the password column with a KMS key.
