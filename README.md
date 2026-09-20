# Cúram

AI-first GP practice management for Irish general practice. This repository implements the product in `docs/curam-build-plan.md`: practice workspace, patient records, scheduling, HealthLink queue, Healthmail prescription flow, CDM, billing, Síle, workflows, plus Supabase schema, edge function stubs, a HealthLink bridge agent, and a MyCúram patient-app shell.

The web app runs as a **local-first demo**. All mutations write an audit trail in the browser store. Connect a Frankfurt Supabase project when you are ready for production data.

## Run the practice workspace

```bash
pnpm install
PORT=4173 BASE_PATH=/ pnpm dev
```

Sign in with any seeded staff account. Demo password must be at least 12 characters (`RiversideGP12`).

Public booking (cookie banner): `/book`

## What is in the workspace

- Role-aware sidebar (GP, nurse, practice manager, reception)
- Patients with registration + 9-tab record
- SOAP consultation with consent-gated AI draft (must be approved)
- Calendar, waiting room, online booking with emergency screening
- Repeat Rx: GP approve then Healthmail send
- CDM: nurse sign then GP sign
- Billing with aging, PCRS and insurer tabs
- Workflow toggles and run history
- GDPR export and retention-blocked erasure demo

## Backend (Supabase EU)

SQL lives in `supabase/migrations/`. Edge functions live in `supabase/functions/`. Copy `.env.example` to `.env.local`.

## HealthLink bridge

`bridge-agent/` is a local Node/Electron-shaped agent. It polls on the practice PC and pushes parsed HL7 to `healthlink-ingest`. Certificates never leave the machine.

## MyCúram

`mobile/` is the patient app shell (large type, 48px tap targets, no swipe-only gestures).
