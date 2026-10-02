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

This is the GP's daily bread — walk it start to finish with the patient you
registered (we'll call them "the patient" below).

### 5.1 Book the appointment

1. Open **Calendar** from the sidebar.
2. Find the column with your name (Day view = one column per clinician).
3. Click an empty slot in your column (the time is picked automatically,
   rounded to 15 minutes) — the **Book appointment** panel opens.
4. Choose the **Patient**, adjust **Time** if needed, pick a **Type**
   (Routine, CDM, Urgent…), then click **Confirm booking**.
5. **Expect**: the panel closes and a coloured block appears in your column.
6. Navigate with **‹ Today ›** and the **Day / Week / Month** switcher; click
   **Pick date** to jump. The red line is *now*.
7. **Google Calendar check**: open the GP's Google Calendar in a new tab —
   the appointment is there ("Cúram — \<GP name\>" calendar), and a
   confirmation email went to the patient (once the sending domain is
   verified — see Known gaps).

### 5.2 Walk the patient in

1. Open **Waiting room** from the sidebar — today's appointments are listed.
2. Click **Check in** on the patient's row.
3. **Expect**: they move to the waiting list, ready for the consult.

### 5.3 The consultation — AI scribe

1. Open the **patient's record** (Patients → click the patient) → click
   **Start consultation**.
2. Pick a **template** (GP consult, nurse review…) — the SOAP fields adapt.
3. In the **AI scribe** panel on the right:
   - tick **Patient consent for recording** (required — consent is logged);
   - click **Start capture**, speak a sentence of clinical detail out loud
     (e.g. *"Patient is a 62-year-old with type 2 diabetes, HbA1c 8.2 on
     metformin, feels tired lately"*) — the mic icon asks permission once;
   - click **Stop capture**, then **Structure SOAP**.
4. **Expect**: the transcript appears and the SOAP fields fill themselves
   (Subjective / Objective / Assessment / Plan) with ICPC-2 codes suggested.
5. Review, edit anything, then click **Approve into note** for AI-drafted
   sections — nothing AI-generated is written into the record without a
   human click (HIQA rule).
6. Click **Sign note** → confirm. **Expect**: the note is locked — signed
   notes are permanent and audit-logged.

### 5.4 Prescribe

1. On the patient's record (or **Prescriptions** page), create a
   prescription: drug, dose, frequency, duration, nominated pharmacy.
2. Open **Prescriptions** → find it → click **Approve** → confirm the
   dialog. **Expect**: a GP sign-off is recorded (audit log), status
   changes — prescriptions are **never** auto-approved.
3. If the GP connected **Healthmail** in Settings: click **Send** to deliver
   it to the pharmacy's `@healthmail.ie` address.
4. Bonus loop: on the phone (patient app, section 7) request a repeat —
   it appears **pending** here for the GP to approve.

### 5.5 CDM — Chronic Disease Management (GMS patients)

CDM pays per review, but **both signatures are mandatory**:

1. Open **CDM programmes** → the patient appears under **Eligible** (GMS +
   chronic condition + not yet enrolled).
2. Click **Enrol** → consent confirmed, next review date set (+1 month).
3. **Nurse**: Start review → fill the measurement fields (HbA1c, BP, BMI…)
   → **Nurse sign**.
4. **GP** (sign in as the GP — role matters): the review shows under
   **Reviews due** → check the values → **GP sign-off**.
5. **Expect**: review marked Completed; a **PCRS claim** is staged in
   **Billing → PCRS claims**; the enrolment's next review moved +6 months.

### 5.6 Referral

1. On the patient's record (or **Referrals** page) queue a referral —
   specialty, hospital, notes.
2. In **Referrals**, click **Approve & send** → confirm. With the bridge
   agent running it goes out via HealthLink and gets an acknowledgement;
   without it, it stays queued and sends when the bridge connects.

### 5.7 Billing — get paid

1. Complete a **private** appointment (mark it completed in the waiting
   room flow). **Expect**: an invoice is created automatically at the
   practice's fee. (GMS appointments never invoice — they're PCRS-claimed.)
2. Open **Billing** → find the invoice → click **Payment link** → open the
   link on the phone.
3. Pay with Stripe's test card: `4242 4242 4242 4242`, any future expiry,
   any CVC.
4. **Expect**: the invoice flips to **paid** automatically (webhook), a
   receipt is printable, and a payment audit entry is written.
   For walk-in cash/card, use **Cash / in-room** instead.

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
