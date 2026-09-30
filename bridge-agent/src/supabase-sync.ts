// Sync layer between the bridge agent and Cúram's healthlink-ingest API.
import { log } from './logger';
import type { BridgeConfig } from './config';
import type { HealthlinkMessage } from './healthlink-client';
import { escapeXml } from './healthlink-client';

export interface OutboundReferral {
  id: string;
  patient: { first_name: string; last_name: string; ihi_number?: string; date_of_birth?: string };
  specialty?: string;
  hospital?: string;
  bridge_payload?: Record<string, unknown> | null;
}

async function callIngest(
  config: BridgeConfig,
  body: Record<string, unknown>
): Promise<Record<string, any>> {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/healthlink-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-key': config.bridgeKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ingest API ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function heartbeat(config: BridgeConfig): Promise<void> {
  await callIngest(config, { action: 'heartbeat' });
}

// Push a batch of parsed inbound messages.
export async function ingestMessages(
  config: BridgeConfig,
  messages: HealthlinkMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const result = await callIngest(config, {
    action: 'ingest',
    messages: messages.map((m) => ({
      type: m.parsed.type,
      healthlink_message_id: m.parsed.healthlink_message_id,
      raw: m.raw,
      source_hospital: m.parsed.source_hospital,
      patient: m.parsed.patient,
      results: m.parsed.results,
      abnormal_flags: m.parsed.abnormal_flags,
      summary: m.parsed.summary,
      diagnosis: m.parsed.diagnosis,
      medications: m.parsed.medications,
      follow_up: m.parsed.follow_up,
      urgent: m.parsed.urgent,
      healthlink_ref: m.parsed.healthlink_ref,
      hospital: m.parsed.hospital,
      appointment_date: m.parsed.appointment_date,
      note: m.parsed.note,
    })),
  });
  log.info(`ingested ${result.stored}/${messages.length} messages`, result.errors?.length ? { errors: result.errors } : undefined);
}

// Fetch referrals queued in Cúram and submit each via HealthLink.
export async function processOutbox(
  config: BridgeConfig,
  submit: (config: BridgeConfig, xml: string) => Promise<{ healthlinkRef?: string; error?: string }>
): Promise<void> {
  const { referrals } = await callIngest(config, { action: 'outbox' });
  for (const referral of referrals as OutboundReferral[]) {
    const xml = buildReferralXml(config, referral);
    const result = await submit(config, xml);
    if (result.error) {
      log.error(`referral ${referral.id} submission failed`, { error: result.error });
      await ackReferral(config, referral.id, { error: result.error });
    } else {
      log.info(`referral ${referral.id} submitted`, { healthlinkRef: result.healthlinkRef });
      await ackReferral(config, referral.id, { healthlinkRef: result.healthlinkRef });
    }
  }
}

async function ackReferral(
  config: BridgeConfig,
  referralId: string,
  outcome: { healthlinkRef?: string; error?: string }
): Promise<void> {
  await callIngest(config, {
    action: 'ack',
    referral_id: referralId,
    healthlink_ref: outcome.healthlinkRef,
    error: outcome.error,
  });
}

// Build the HL7 v2.4 REF^I12 XML for an outbound eReferral.
export function buildReferralXml(config: BridgeConfig, referral: OutboundReferral): string {
  const p = referral.patient;
  const payloadNote =
    (referral.bridge_payload && typeof referral.bridge_payload.note === 'string'
      ? referral.bridge_payload.note
      : '') ?? '';
  return `<?xml version="1.0"?>
<REF_I12>
  <MSH>
    <MSH.4>CURAM-BRIDGE</MSH.4>
    <MSH.9><MSH.9.1>REF</MSH.9.1><MSH.9.2>I12</MSH.9.2></MSH.9>
    <MSH.10>${escapeXml(referral.id)}</MSH.10>
  </MSH>
  <PID>
    <PID.3>${escapeXml(p.ihi_number ?? '')}</PID.3>
    <PID.5><PID.5.1>${escapeXml(p.last_name)}</PID.5.1><PID.5.2>${escapeXml(p.first_name)}</PID.5.2></PID.5>
    <PID.7>${escapeXml((p.date_of_birth ?? '').replace(/-/g, ''))}</PID.7>
  </PID>
  <RF1>
    <RF1.2><RF1.2.1>PENDING</RF1.2.1></RF1.2>
  </RF1>
  <NTE><NTE.3>${escapeXml(
    `${referral.specialty ?? 'General'} referral to ${referral.hospital ?? 'TBD'}. ${payloadNote}`
  )}</NTE.3></NTE>
</REF_I12>`;
}
