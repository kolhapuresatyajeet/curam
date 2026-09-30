# Cúram HealthLink Bridge

Desktop agent that runs on the practice PC (where the HealthLink digital
certificate lives) and moves HL7 v2.4 messages between HealthLink and Cúram.

## What it does

- **Inbound** (polls HealthLink every 60s): lab results (ORU), discharge
  summaries (ADT), referral acknowledgements (REF) → parsed and pushed to
  Cúram's `healthlink-ingest` API, which files them to lab results / inbox.
  Abnormal lab results are always flagged for GP callback (never AI delivery).
- **Outbound**: picks up eReferrals queued in Cúram (`bridge_status = queued`),
  builds HL7 REF^I12 XML, submits via HealthLink, and reports back.
- **Tray app**: green/grey/red status dot, runs in background, auto-starts
  with the OS, checks for updates on launch.
- **Audit**: every message (raw + status) is logged to `healthlink_messages`
  in Supabase (HIQA compliance) and locally to `bridge.log`.

## Setup at a practice

1. Install the agent (`npm run dist` builds a Windows NSIS installer).
2. Get the bootstrap key from the practice manager (Supabase secret
   `BRIDGE_API_KEY`).
3. On first run the agent registers itself against the practice and receives
   its own per-agent key. Edit `%APPDATA%/curam-bridge/config.json` (or use
   the in-app flow once wired) with:
   ```json
   {
     "supabaseUrl": "https://<project>.supabase.co",
     "bridgeKey": "<per-agent key from registration>",
     "practiceId": "<practice uuid>",
     "healthlink": {
       "endpoint": "https://…",          // provisioned at formal integration
       "practiceHealthlinkId": "…",
       "certPath": "C:\\…\\certificate.pfx",
       "certPassphrase": "…"
     }
   }
   ```
4. The HealthLink PFX certificate is exported once from the Windows
   certificate store; the agent auto-detects it in
   `%APPDATA%/HealthLink/certificate.pfx` if present.

## Formal integration testing

The exact HealthLink Online WSDL/endpoint is provisioned during formal
integration testing (build plan month 16). Until then `healthlink.endpoint`
is empty and the agent runs harmlessly, heartbeating its status to Cúram.
