# Cúram — GP End-to-End Trial Guide

A step-by-step script for trialling Cúram with a GP: every module, all three
apps (web, HealthLink bridge, patient app), ending with the GP able to start
using the platform for real. Allow **60–90 minutes**.

---

## 0. What you need before the session

| Item | Why |
|---|---|
| GP's **Google account** (email + password) | Sign-in is Google OAuth only |
| A second Google account (optional) | Demonstrates staff invites + roles |
| **Practice PC** (Windows) with the HealthLink digital certificate | Runs the Electron bridge agent |
| A **smartphone** (GP's or yours) with **Expo Go** installed | Patient app demo |
| Stripe account (test mode keys already wired) | Online payments demo |
| Ledger of the practice's private fees | Billing rates come from `practice_fees` |

The staff web app needs **nothing installed** — it runs at the deployed URL
(e.g. `https://curam-phi.vercel.app`).

---

## 1. Staff web app — sign in and create the practice (10 min)

1. Open the deployed URL → you are redirected to `/login`.
2. Click **Create a practice** → **Continue with Google** → sign in.
3. Fill: your name, practice name, address, Eircode, phone → **Create practice**.
   - You are now the practice's first GP (this drives all role permissions).
4. **Expect**: the dashboard, empty of data — no demo patients anywhere.

## 2. Settings — connect the integrations (10 min)

In **Settings**, top to bottom:

1. **Stripe** → *Connect Stripe* → complete Stripe's hosted onboarding
   (business details, IBAN for payouts) → returned to Settings with status
   **connected**. (Test mode today; flip to live keys at go-live.)
2. **Google Calendar** → *Connect my Google Calendar* → creates a secondary
   calendar "Cúram — \<your name\>" in your Google account.
3. **Healthmail** (optional today) → connect the practice's `@healthmail.ie`
   account for prescription sending. If the GP has no account yet, skip —
   prescriptions can be approved and sent later.
4. **Export workspace (JSON)** — point it out: GDPR data export, one click.

## 3. Invite staff (5 min)

1. **Staff & rota** → invite a member by role (e.g. Nurse) — use the exact
   Google email they will sign in with.
2. **Expect**: "Invite pending" badge.
3. On the second account (private window): sign in with Google → the pending
   badge clears and the sidebar shows only what their role allows
   (reception cannot approve prescriptions; CDM needs nurse AND GP).

## 4. Register a patient (5 min)

1. **Patients → Register**: name, DOB, phone (`08X XXX XXXX`), email
   (**use a real inbox you control — the patient app needs it**), GMS number
   or private, nominated pharmacy Healthmail address if known.
2. **Expect**: the patient appears in the panel list.

## 5. The clinical loop — the core demo (20 min)

Walk this exact loop; it's the GP's daily bread:

1. **Calendar** → click an empty slot → book the patient (15-min rounding,
   clinician column). Check **Day / Week / Month** and Google Calendar — the
   appointment appears in the clinician's "Cúram — name" calendar.
2. **Booking email**: the patient gets a confirmation email (requires the
   Resend sending domain to be verified — see "Known gaps").
3. **Waiting room** → check the patient in on arrival.
4. **Consultation** (patient record → Start consultation): dictate a sentence
   → stop → **Expect**: AI structures a SOAP note + ICPC-2 codes (needs the
   AI keys wired). Edit → **Sign** (confirm — signed notes are permanent).
5. **Prescriptions**: create an Rx on the patient → **Approve** (confirm — GP
   sign-off) → if Healthmail connected, send to the pharmacy address.
6. **Patient app**: the patient requests a repeat → it lands as *pending* →
   GP approves in **Prescriptions**.
7. **CDM** (GMS patient with a chronic condition): enrol → **Start review** →
   nurse fills values and signs → GP signs off → **Expect**: claim staged in
   **Billing → PCRS claims**, next review +6 months.
8. **Referrals**: queue a referral → approve & send (with the bridge running
   it goes out via HealthLink; otherwise it stays queued).
9. **Billing**: complete a *private* appointment → invoice auto-created →
   **Payment link** → pay on a phone with the Stripe test card
   `4242 4242 4242 4242` → **Expect**: invoice flips to paid + audit entry.
   GMS appointments never generate invoices (PCRS-claimed instead).

## 6. HealthLink bridge — Electron agent on the practice PC (15 min)

Runs where the HealthLink digital certificate lives. Until formal
integration testing (endpoint provisioning, build-plan month 16) it runs
harmlessly: registration, heartbeats, and the full message pipeline minus
the HealthLink wire itself.

1. On the practice PC, open the **HealthLink** page in the staff web app →
   **Download for Windows/Mac** (platform-detected; installers are hosted on
   the public `curam-releases` GitHub repo — nothing to clone, no Node).
2. Install (Windows: one-click Setup exe, runs after install; macOS: open
   the dmg). The app lives in the **system tray** with a status dot and
   starts with the OS.
3. Get the bootstrap key: Supabase secret `BRIDGE_API_KEY`.
4. First run: the agent registers against the practice and receives its own
   per-agent key (saved to `%APPDATA%/curam-bridge/config.json`).
5. Confirm in the **HealthLink page** that the agent shows as
   registered/heartbeating.
6. **Simulate the pipeline** (from any machine, using the agent key):
   - inbound lab result (ORU) → lands in **HealthLink** page + urgent inbox;
     abnormal flags force **GP callback** delivery — never AI;
   - referral round-trip: queue in Cúram → outbox → ack → `acked`.
   Full curl commands: `docs/testing.md` §3.

To release a new bridge version: bump the version in
`bridge-agent/package.json`, run `npm run dist:win` / `dist:mac`, upload the
installers to a new release in `curam-releases`, and bump `BRIDGE_VERSION`
in `src/pages/healthlink.tsx`.

## 7. Patient app — MyCúram on a phone (10 min)

The patient's email (step 4) must be on file in Cúram.

1. Install **Expo Go** on the phone.
2. Set the Supabase **anon key** in `patient-app/app.json` →
   `extra.supabaseAnonKey`, then:
   ```bash
   cd patient-app && npm install && npm start
   ```
3. Scan the QR with Expo Go → sign in with the **patient's email** (magic
   link — first sign-in links the account to the patient record).
4. Demo on the phone:
   - **Home**: next appointment, quick actions
   - **Book**: pick clinician + slot → books into the real diary
   - **Repeats**: request a repeat → appears pending in the staff app
   - **Results**: normal results show GP comments; **abnormal results never
     show values** — the app asks the patient to phone the practice
   - **Messages**: two-way messaging with the practice
5. **Public booking**: open `/book` in any phone browser (no login) → book →
   appears in the diary.

## 8. Prove the compliance spine (5 min)

HIQA/GDPR is the selling point — show it:

1. **Supabase → `audit_log`**: every action today (logins, signed notes, Rx
   approvals, payments) has an entry.
2. **Settings → Export workspace (JSON)**: full GDPR export.
3. **RLS isolation** (two practices only): data from practice A is invisible
   to practice B, enforced at the database.

---

## Known gaps to mention during the trial

| Feature | Status |
|---|---|
| HealthLink wire format | Real endpoint at formal integration testing (month 16) — everything else is live |
| Booking/reminder emails | Blocked until the Resend sending domain DNS is verified |
| WhatsApp reminders | Needs approved Twilio Content Templates (number has no SMS capability) |
| Síle voice calls end-to-end | Needs the voice platform account + phone number |
| Automated insurer claims | Deliberately deferred ("coming soon" in UI) |

## After the trial — go-live checklist

1. Switch Stripe from test to live keys (platform + practice onboarding).
2. Verify the Resend sending domain; approve WhatsApp templates.
3. Create a staging Supabase project; move trial test data out of dev.
4. Envelope-encrypt Healthmail credentials (migration 027 TODO).
5. Real HealthLink certificates + endpoint scheduling via GPIT.
