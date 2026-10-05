#!/usr/bin/env node
/**
 * Cúram folder-watch bridge — watches a practice's HealthLink drop folder
 * and uploads every new report (.xml/.hl7 parsed and filed like a bridge
 * message; PDFs/scans stored privately) to the report-upload Edge Function.
 *
 * Zero npm dependencies — needs only Node.js 18+. No installer, no
 * code-signing certificate.
 *
 * Usage:
 *   node folder-watch.cjs --mint "Reception PC"
 *       Generates a bridge key (shown ONCE) and prints the SQL to register
 *       it. Run the SQL in the Supabase dashboard by the platform admin.
 *
 *   node folder-watch.cjs --dir "C:\HealthLink\out" --url https://<ref>.supabase.co --key fbk_...
 *       Watches the folder and uploads new files. Keeps running (Ctrl+C to
 *       stop). Unprocessed files found at startup are uploaded too.
 *
 * Every uploaded file is recorded in a local state file so nothing is sent
 * twice, even after a restart. Files that fail are retried automatically.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Helpers ──────────────────────────────────────────────────────────────

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(__dirname, 'folder-watch.log'), line + '\n');
  } catch { /* logging must never stop the bridge */ }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) args[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

/** Mint mode: create a key and print one-time SQL to register it. */
function mint(name) {
  const key = `fbk_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  console.log('\nBridge key (copy now — it is NOT stored anywhere in plaintext):\n');
  console.log(`  ${key}\n`);
  console.log('Register it by running this SQL in the Supabase dashboard (SQL Editor),');
  console.log('replacing <practice-id> with the practice\'s id from the practices table:\n');
  console.log(
    `  insert into bridge_keys (practice_id, key_hash, name)\n` +
    `  values ('<practice-id>', '${hash}', '${String(name ?? 'Folder-watch bridge').replace(/'/g, "''")}');\n`,
  );
  console.log('Then start watching with:\n');
  console.log(`  node folder-watch.cjs --dir "<drop-folder>" --url "https://<project-ref>.supabase.co" --key ${key}\n`);
}

// ── Upload one file (with stability wait + retries) ─────────────────────

async function waitUntilStable(filePath) {
  let last = -1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const size = fs.statSync(filePath).size;
    if (size === last && size > 0) return true;
    last = size;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false; // never stabilised (locked/open file) — skip for now
}

async function uploadFile(filePath, config) {
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), name);
  const response = await fetch(`${config.url}/functions/v1/report-upload`, {
    method: 'POST',
    headers: { 'x-bridge-key': config.key },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function processFile(filePath, config, state) {
  const key = filePath;
  if (state.done[key] || shouldIgnore(filePath)) return;
  if (!(await waitUntilStable(filePath))) {
    log(`Still being written, will retry: ${filePath}`);
    return;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await uploadFile(filePath, config);
      state.done[key] = { at: new Date().toISOString(), kind: result.kind, message: result.message };
      saveState(config, state);
      log(`Uploaded: ${path.basename(filePath)} → ${result.message}`);
      return;
    } catch (e) {
      log(`Upload failed (attempt ${attempt}/3) for ${path.basename(filePath)}: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15_000));
    }
  }
  // Left out of state.done — retried on the next sweep / restart.
}

function shouldIgnore(filePath) {
  const name = path.basename(filePath);
  return name.startsWith('.') || name.startsWith('~$') || name.endsWith('.tmp') || name.endsWith('.part');
}

function saveState(config, state) {
  try {
    fs.writeFileSync(config.statePath, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`Could not save state: ${e.message}`);
  }
}

// ── Watch mode ───────────────────────────────────────────────────────────

async function watch(config) {
  let state = { done: {} };
  try {
    const saved = JSON.parse(fs.readFileSync(config.statePath, 'utf8'));
    if (saved && typeof saved.done === 'object') state = saved;
  } catch { /* first run — no state file yet */ }
  log(`Watching ${config.dir} (state: ${config.statePath})`);

  const entries = fs.readdirSync(config.dir).filter((f) => !shouldIgnore(f));
  for (const entry of entries) {
    const full = path.join(config.dir, entry);
    try { if (fs.statSync(full).isFile()) await processFile(full, config, state); } catch { /* ignore */ }
  }

  const sweep = async () => {
    let entries = [];
    try { entries = fs.readdirSync(config.dir); } catch { return; }
    for (const entry of entries) {
      const full = path.join(config.dir, entry);
      try {
        if (fs.statSync(full).isFile()) await processFile(full, config, state);
      } catch { /* file may vanish mid-check */ }
    }
  };

  fs.watch(config.dir, () => { void sweep(); });
  // Safety-net sweep every 5 minutes in case a filesystem event is missed.
  setInterval(() => { void sweep(); }, 5 * 60_000).unref();
  log('Bridge is running. Press Ctrl+C to stop.');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.mint !== undefined) {
    mint(typeof args.mint === 'string' ? args.mint : 'Folder-watch bridge');
    return;
  }

  const config = {
    dir: args.dir,
    url: (args.url || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''),
    key: args.key || process.env.BRIDGE_KEY || '',
    statePath: args.state || path.join(__dirname, 'folder-watch-state.json'),
  };

  if (!config.dir || !fs.existsSync(config.dir)) {
    console.error('Error: pass the folder to watch with --dir "<path>" (must exist).');
    console.error('Get a key first:  node folder-watch.cjs --mint "Reception PC"\n');
    process.exit(1);
  }
  if (!config.url.startsWith('https://')) { console.error('Error: pass the project URL with --url https://<ref>.supabase.co'); process.exit(1); }
  if (!config.key) { console.error('Error: pass the bridge key with --key fbk_... (mint one with --mint)'); process.exit(1); }

  await watch(config);
}

main().catch((e) => { log(`Fatal: ${e.message}`); process.exit(1); });
