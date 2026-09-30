# MyCúram — patient app

React Native (Expo) app for patients. Companion to the Cúram GP platform.

## Features

- **Magic-link sign-in** — patients sign in with their email; first sign-in
  links the account to their patient record (`claim_patient_access` RPC — the
  practice must have the patient's email on file).
- **Home** — next appointment + big quick actions.
- **Booking** — pick clinician, day, and a 30-minute slot; books via RLS insert.
- **Repeat prescriptions** — tick active medications, set pharmacy, request.
  The GP approves before anything is sent (never auto-approved).
- **Results** — normal results show the GP's comment. **Abnormal results never
  show values** — the app asks the patient to phone the practice (GP callback
  only, per practice policy).
- **Messages** — secure two-way messaging with read receipts.
- **Health log** — glucose, blood pressure, weight, symptoms for CDM reviews.

## Elderly-first design rules

18px minimum text, high-contrast colours, 56px touch targets, taps only (no
swipes, no long-presses, no pull-to-refresh dependency).

## Setup

1. `npm install`
2. Set the Supabase anon key in `app.json` → `extra.supabaseAnonKey`
3. `npm start` (Expo dev server) — then scan the QR with Expo Go

The app reads/writes directly to Supabase under the patient's own RLS policies
(migration `021_patient_app.sql`): patients only ever see their own rows, and
abnormal-result values are additionally withheld in the UI.
