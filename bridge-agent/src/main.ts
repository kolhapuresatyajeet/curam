/**
 * HealthLink bridge agent.
 * Runs on the practice PC. Certificate handling is local-only — never upload the private key.
 */
import { pollHealthLink } from './healthlink-client.ts';
import { parseMessage } from './message-parser.ts';
import { pushToApi } from './api-sync.ts';
import { certificateStatus } from './certificate-manager.ts';

const INTERVAL_MS = 60_000;

async function tick() {
  const cert = certificateStatus();
  if (!cert.present) {
    console.warn('HealthLink certificate not found in the local store.');
    return;
  }
  const messages = await pollHealthLink();
  for (const raw of messages) {
    const parsed = parseMessage(raw);
    await pushToApi(parsed);
  }
}

export async function startBridge() {
  console.info('Cúram HealthLink bridge started');
  await tick();
  setInterval(() => {
    tick().catch((error) => console.error(error));
  }, INTERVAL_MS);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBridge();
}
