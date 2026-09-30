// HealthLink Online web service client. Authenticates with the practice's
// digital certificate (mutual TLS) and polls for new HL7 v2.4 messages.
//
// NOTE: the exact endpoint WSDL is provisioned during HealthLink formal
// integration testing (build plan month 16). Until then the endpoint is
// configurable in config.json and calls fail gracefully if unset.
import * as fs from 'fs';
import * as https from 'https';
import { log } from './logger';
import type { BridgeConfig } from './config';
import type { ParsedMessage } from './hl7-parser';
import { parseHl7Xml } from './hl7-parser';

export interface HealthlinkMessage {
  raw: string;
  parsed: ParsedMessage;
}

function createAgent(config: BridgeConfig): https.Agent | undefined {
  const { certPath, certPassphrase } = config.healthlink;
  if (!certPath || !fs.existsSync(certPath)) return undefined;
  return new https.Agent({
    pfx: fs.readFileSync(certPath),
    passphrase: certPassphrase,
    // HealthLink uses private CA chains — trust the node bundle plus rely on
    // the platform store; rejectUnauthorized stays on for production.
    rejectUnauthorized: true,
  });
}

async function post(agent: https.Agent | undefined, url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HealthLink HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          } else {
            resolve(data);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('HealthLink request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Poll for new messages. Returns every message in the response envelope,
// already parsed. Unknown message types are passed through with type 'other'
// so they still reach the audit log in Supabase.
export async function fetchMessages(config: BridgeConfig): Promise<HealthlinkMessage[]> {
  const { endpoint, practiceHealthlinkId } = config.healthlink;
  if (!endpoint) {
    log.warn('HealthLink endpoint not configured — skipping poll');
    return [];
  }
  const envelope = `<?xml version="1.0"?>
<HealthLinkRequest>
  <PracticeID>${escapeXml(practiceHealthlinkId)}</PracticeID>
  <Action>PollMessages</Action>
</HealthLinkRequest>`;

  const response = await post(createAgent(config), endpoint, envelope);
  return extractMessages(response);
}

// Submit an outbound referral (HL7 REF message built by buildReferralXml).
export async function submitReferral(
  config: BridgeConfig,
  referralXml: string
): Promise<{ healthlinkRef?: string; error?: string }> {
  const { endpoint } = config.healthlink;
  if (!endpoint) return { error: 'HealthLink endpoint not configured' };
  try {
    const response = await post(createAgent(config), endpoint, referralXml);
    const refMatch = response.match(/<ReferralID>([^<]+)<\/ReferralID>/);
    const accepted = /<Status>\s*(?:Accepted|Received)/i.test(response);
    if (!accepted) return { error: `HealthLink rejected referral: ${response.slice(0, 300)}` };
    return { healthlinkRef: refMatch?.[1] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Split a poll response into individual messages and parse each. Isolates
// parse failures so one bad message doesn't lose the batch.
export function extractMessages(responseXml: string): HealthlinkMessage[] {
  const out: HealthlinkMessage[] = [];
  const messageBlocks = responseXml.match(/<(?:ORU|ADT|REF|OML|OUL)_[A-Z0-9]+[\s\S]*?<\/(?:ORU|ADT|REF|OML|OUL)_[A-Z0-9]+>/g) ?? [];
  for (const block of messageBlocks) {
    try {
      out.push({ raw: block, parsed: parseHl7Xml(block) });
    } catch (e) {
      log.error('failed to parse HealthLink message', {
        error: e instanceof Error ? e.message : String(e),
        preview: block.slice(0, 200),
      });
    }
  }
  return out;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
