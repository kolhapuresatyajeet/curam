# Folder-watch bridge (optional)

Watches a practice's HealthLink drop folder on a Windows/Mac PC and uploads
every new report into Cúram automatically — labs are parsed and filed through
the same pipeline as the manual Upload tab (abnormal results always go to GP
callback), and PDFs/letters land in the practice's Inbox. **Zero staff
action.** This is the automated alternative to drag-and-drop; use it only for
practices whose HealthLink setup writes files to a local folder.

## 1. Mint a bridge key (once per practice, by the platform admin)

```bash
node scripts/folder-watch.cjs --mint "Reception PC"
```

Copy the `fbk_…` key it prints (shown **once** — only a SHA-256 hash is
stored), and run the printed SQL in the Supabase dashboard SQL Editor,
replacing `<practice-id>` with the practice's id.

## 2. Install Node on the practice PC

Node.js 18 or newer — no other dependencies, nothing else to install.

## 3. Start the watcher

```bash
node scripts/folder-watch.cjs --dir "C:\HealthLink\out" \
  --url "https://duphvinfwkskjkfqaetr.supabase.co" \
  --key "fbk_…"
```

Files already sitting unprocessed in the folder are uploaded on startup, then
new files are picked up the moment they appear (with a 5-minute safety-net
sweep). Every result is logged to `scripts/folder-watch.log` and a state file
prevents double-sending, even after restarts. Failed uploads retry
automatically.

To run it without staying logged in, create a Windows Task Scheduler job (or
macOS launchd item) that runs the command at startup. Later, this can be
upgraded to a signed Electron tray app with the same key.

## Security notes

- The key is scoped to **one practice** — it cannot read or write any other
  practice's data, and can be revoked any time:
  `update bridge_keys set active = false where name = 'Reception PC';`
- The key only allows **uploading reports** — no patient records, no notes.
- Every upload is audit-logged with `via: 'folder-watch'` (HIQA).
- If the PC is off, reports simply wait in the folder and upload when the
  machine and watcher come back.
