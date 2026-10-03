# Cúram — Go-Live Checklist (10 clinics)

Everything to do before onboarding the first paying clinic. Sizing and
costs assume **10 clinics** (~15–25 staff total, ~200–400 consults/day).
Prices are list price at time of writing — check before purchase.

---

## 1. Accounts & paid plan upgrades

- [ ] **Vercel Pro** (~$20/seat/mo) — required by Vercel ToS for commercial use anyway. Also unlocks: domains on production, team roles, advanced CI. Add the owner + any second seat.
- [ ] **Supabase Pro** (~$25/mo base) — free tier pauses after 1 week of inactivity and has no SLA; unacceptable for a live clinical system.
  - [ ] Add **compute add-on** if DB CPU is small (Micro ~$10/mo to start; monitor and scale later)
  - [ ] Add **Point-in-Time Recovery (PITR)** (~$32/mo) — restore to any minute; essential for clinical records
  - [ ] Confirm project region is **eu-central-1 (Frankfurt)** — `duphvinfwkskjkfqaetr` already is; create the *production* project in Frankfurt too
  - [ ] Decide: **separate Supabase project for production** vs current one. Recommended: new clean project for prod; keep this one as staging.
- [ ] **Resend paid plan** (~$20/mo, 50k emails/mo) — free tier is 100 emails/day and no domain freedom; booking confirmations + reminders exceed it at 10 clinics.
- [ ] **Twilio** — upgrade from trial (trial adds "sent from Twilio trial" to messages and blocks arbitrary numbers).
  - [ ] Register WhatsApp **business profile** with Meta (display name, verification)
  - [ ] Submit **message templates** for approval: appointment reminder, booking confirmation, lab-ready notice — approval takes days; do early
- [ ] **Stripe** — switch from test mode to **live keys**.
  - [ ] Live platform account + enable **Connect** (Express accounts for each clinic)
  - [ ] Move `STRIPE_SECRET_KEY` / webhook secret to live values (Supabase secrets + Vercel env)
  - [ ] Recreate the webhook endpoint for the live environment
  - [ ] Decide platform fee: Stripe application_fee on each clinic's payments (your SaaS revenue) — agree % with clinics first
- [ ] **Apple Developer** ($99/yr) + **Google Play Console** ($25 once) for MyCúram (see §9)
- [ ] **Sentry** (Team ~$26/mo) or similar — error tracking for web + patient app (see §11)

## 2. Infrastructure & regions (EU only)

- [ ] All patient data in **eu-central-1 (Frankfurt)**: Supabase ✓, and anything else touching PHI
- [ ] **LiteLLM gateway**: confirm it is EU-hosted (if self-hosted: Hetzner/Railway EU region, ~€5–20/mo). The processing register already promises EU routing.
- [ ] **Vercel region**: set serverless functions region to `fra1` (Frankfurt) in project settings — default is often `iad1` (US)
- [ ] Review every Vercel env var / Supabase secret for staging vs production values (two separate environment sets)
- [ ] **Custom domain**: register `curam.website` (~€25/yr)
  - [ ] `curam.website` + `app.curam.website` → Vercel
  - [ ] `book.curam.website` → public booking pages
  - [ ] `mail.curam.website` → Resend sending domain
  - [ ] Enable HTTPS (auto via Vercel), HSTS

## 3. Email deliverability (Resend)

- [ ] Add `mail.curam.website` to Resend and complete **SPF + DKIM verification**
- [ ] Set `RESEND_FROM` to the new domain (`bookings@mail.curam.website`) — the current `mail.voicehub.uk` domain is a stopgap
- [ ] Set up **DMARC** record on curam.website
- [ ] Test: booking email lands in Gmail + Outlook inboxes, not spam
- [ ] Supabase Auth emails: configure custom SMTP (Resend) for magic links / password resets with the same domain

## 4. AI (Síle) — production settings

- [ ] Confirm LiteLLM gateway key is stored only in Supabase secrets (`LITELLM_API_KEY`), never in Vercel/client env
- [ ] **Raise monthly cap**: `AI_MONTHLY_CAP_CENTS` is currently 500 (€5). At ~€0.01/consult, set **1500 (€15) per clinic** — decide whether the cap check is per-practice (verify `ai_usage_log` budget query scopes by practice before launch; if global, fix it)
- [ ] Confirm transcription chat-model fallback is EU-routed (`gemini-3.8-flash` via gateway)
- [ ] Verify audio is never persisted (audio blobs are request-scoped only) — spot-check the scribe function
- [ ] Draft the AI addendum for the patient consent / privacy notice: recording, transcription, human approval of every AI output

## 5. Payments & billing (Stripe)

- [ ] Live mode keys rotated into Supabase secrets + Vercel
- [ ] Stripe Connect onboarding tested end-to-end in live mode with one real clinic
- [ ] Webhook secret for live endpoint set (`STRIPE_WEBHOOK_SECRET`)
- [ ] PCRS claim flow marked as manual/deferred in billing UI (already deferred — confirm copy)

## 6. Google Calendar

- [ ] Move OAuth client to **production** status; decide on verification scope:
  - 10 clinics × ~2 staff each = ~20 test users — unverified "testing" mode caps at 100 external users and tokens expire in 7 days. **Either** verify the app (calendar scope review takes ~a week) **or** add each staff account as a test user and accept re-consent weekly (not acceptable — verify the app)
- [ ] Confirm redirect URIs use the production domain

## 7. Irish healthcare integrations

- [ ] **HealthLink**: apply for production HealthLink connectivity per clinic (via GPIT/HealthLink national mailbox). The Electron bridge + mutual-TLS flow needs each practice's cert. Allow weeks of lead time — start first.
- [ ] **Healthmail**: each GP/nurse needs their own @healthmail.ie account (they register themselves; Cúram stores credentials encrypted in Vault — complete migration 027 TODO: envelope-encrypt credentials at rest)
- [ ] **PCRS**: manual claim workflow only for launch (automated PCRS claims are deferred — keep the UI copy honest)
- [ ] **GPIT / ICGP**: engage early for accreditation credibility (marketing, not a hard launch blocker)

## 8. Security & compliance (GDPR / HIQA)

- [ ] **RLS audit**: run through every table's policies once more; confirm cross-practice reads are impossible (the support-impersonation path goes through normal RLS — verify it can't see more than the impersonated staff member)
- [ ] **2FA**: confirm TOTP enrolment is enforced on all staff logins
- [ ] **Session timeout**: 30 min inactivity — confirm it works in production build
- [ ] **Backups**: enable PITR + scheduled logical backups; **do one test restore** to a scratch project and record how long it takes
- [ ] **Audit log**: confirm every mutation path writes `audit_log` (spot-check: patients, consultations, prescriptions, invoices, exports, impersonation)
- [ ] **Data Protection**: sign a **DPA (Art. 28 processor agreement)** with each clinic; keep the records-of-processing register (Settings → Security & GDPR) accurate; complete a short **DPIA** for the AI scribe
- [ ] **Retention**: adults 8 years / children to 25 — the retention RPC exists; confirm erasure workflow documented for the DPO
- [ ] **Breach procedure**: already documented in Settings — print it into the practice onboarding pack
- [ ] **Incident contact**: security@curam.website mailbox
- [ ] Rotate all secrets (Supabase service key, Twilio auth token, Resend key, LiteLLM key) out of any laptop-local files before prod
- [ ] Service worker: confirm PHI is not cached in ways that survive sign-out (check IndexedDB/localStorage clears on logout)

## 9. MyCúram patient app

- [ ] EAS build profiles for production (iOS + Android)
- [ ] App Store / Play Store listings (privacy policy URL, support URL, data-safety declarations)
- [ ] Point the app at the **production Supabase project** before building (app.json extra)
- [ ] GDPR "Download my data" button — test on a real device
- [ ] Reviewer notes: demo account + demo video (medical apps get extra scrutiny)

## 10. Known code gaps — fix before first paying clinic

- [ ] **Consultations DB sync** (top priority): notes live in browser memory/localStorage; they are invisible to exports, backups, and other devices. Sync to the `consultations` table like appointments.
- [ ] **Per-practice AI budget cap** (verify/fix — see §4)
- [ ] **Envelope-encrypt Healthmail credentials** (migration 027 TODO)
- [ ] Booking emails still reference staging domain in copy — sweep for `curam-phi.vercel.app` / `voicehub.uk` strings
- [ ] Explicit practice-owner role (who can delete the practice) — currently only gp/pm split

## 11. Monitoring & support readiness

- [ ] **Sentry** (free Developer plan) — one project, three SDKs already wired in code:
  - [ ] Create the project at sentry.io → copy the DSN
  - [ ] `VITE_SENTRY_DSN` → Vercel env vars (web app, React 18 build uses @sentry/react v9)
  - [ ] `SENTRY_DSN` → `supabase secrets set SENTRY_DSN=...` (Edge Functions — `withMonitoring` wrapper is applied to practice-data-export + remove-staff-member; roll out to remaining functions as they change)
  - [ ] `EXPO_PUBLIC_SENTRY_DSN` → patient app env (sentry-expo; add its config plugin when doing the EAS build — native crash reporting needs it, JS errors work without)
  - [ ] Configure an alert rule: new issue → email + Slack/Telegram
  - [ ] Verify PHI scrubbing: fetch/console breadcrumbs are stripped in src/lib/monitoring.ts — never log patient identifiers
- [ ] **UptimeRobot** (free): monitors on `/login`, `/book`, Supabase `/auth/v1/health` → email alerts
- [ ] **Healthchecks.io** (free): heartbeat ping at the end of the reminders cron function → alert when the cron silently stops
- [ ] Weekly automated DB backup export to encrypted cold storage (own machine or EU object storage)
- [ ] Support workflow: `/support` impersonation console (live), used only with a stated reason; audit reviewed monthly
- [ ] Status page or at least a WhatsApp broadcast list for clinic outages

## 12. Per-clinic onboarding pack (repeat ×10)

- [ ] Clinic details collected: name, address, PCRS reg, HealthLink ID, staff list + roles
- [ ] Staff invited (Supabase auth) → 2FA enrolment at first login
- [ ] HealthLink bridge installed on the practice PC + cert exported
- [ ] Healthmail connected per prescriber
- [ ] Google Calendar connected per clinician
- [ ] Stripe Express account onboarded (if taking online payments)
- [ ] WhatsApp reminder number/templates confirmed
- [ ] DPA signed + AI addendum acknowledged
- [ ] Training session: scribe consent flow, signing notes, labs workflow (abnormal = GP callback only), emergency escalation
- [ ] First-week check-in: audit log review, AI spend review, deliverability check

---

## Rough monthly run cost (10 clinics)

| Item | ~Cost/mo |
|---|---|
| Supabase Pro + PITR + compute | €55–90 |
| Vercel Pro (1–2 seats) | €20–40 |
| Resend Pro | €20 |
| Twilio (WhatsApp/SMS reminders) | €50–150 |
| AI via LiteLLM (capped €15/clinic) | ≤ €150 |
| LiteLLM gateway hosting (EU VPS) | €5–20 |
| Sentry Team | €26 |
| Domain | ~€2 |
| Apple/Google dev accounts (amortised) | ~€10 |
| **Total** | **~€240–500/mo** |

Per-clinic revenue target: €40–80/clinic/mo → 10 clinics covers costs with margin. Charge more than you think — you're replacing Socrates-seat costs, not competing with free.
