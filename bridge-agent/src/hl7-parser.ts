// Parses HL7 v2.4 XML messages from HealthLink into the JSON shapes the
// Cúram healthlink-ingest API expects.
//
// Message types handled:
//   ORU^R01 — lab results (test name, value, units, reference range, flag)
//   ADT^A03/A08 — discharge summaries (diagnosis, medications, follow-up)
//   REF^I12 — referral acknowledgements (status, appointment date)
import { XMLParser } from 'fast-xml-parser';

export type MessageType = 'ORU' | 'ADT' | 'REF';

export interface ParsedMessage {
  type: MessageType | 'other';
  healthlink_message_id?: string;
  source_hospital?: string;
  patient?: {
    patient_id?: string;
    ihi?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
  };
  // ORU fields
  results?: Array<{
    test_name: string;
    value: string;
    units?: string;
    reference_range?: string;
    flag?: string;
  }>;
  abnormal_flags?: string[];
  summary?: string;
  // ADT fields
  diagnosis?: string;
  medications?: string;
  follow_up?: string;
  urgent?: boolean;
  // REF fields
  healthlink_ref?: string;
  hospital?: string;
  appointment_date?: string;
  note?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Keep single-child arrays as arrays.
  isArray: (name) =>
    ['OBX', 'NTE', 'RXA', 'RXE'].includes(name),
});

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Element with attributes/text children: prefer #text.
    if ('#text' in obj) return asText(obj['#text']);
  }
  return undefined;
}

function firstEl(node: unknown, name: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const value = (node as Record<string, unknown>)[name];
  if (Array.isArray(value)) return value[0] as Record<string, unknown>;
  return value as Record<string, unknown> | undefined;
}

function allEls(node: unknown, name: string): Array<Record<string, unknown>> {
  if (!node || typeof node !== 'object') return [];
  const value = (node as Record<string, unknown>)[name];
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>;
}

export function parseHl7Xml(raw: string): ParsedMessage {
  const doc = parser.parse(raw) as Record<string, unknown>;

  // HealthLink wraps messages in an envelope; find the message root
  // (ORU_R01, ADT_A03/ADT_A08, REF_I12 …) wherever it sits.
  const rootKey = Object.keys(doc).find((k) =>
    /^(ORU|ADT|REF|OML|OUL)_/.test(k)
  );
  const root = (rootKey ? doc[rootKey] : doc) as Record<string, unknown>;

  const type = (rootKey?.split('_')[0] as MessageType) ?? 'other';
  const msh = firstEl(root, 'MSH');
  const pid = firstEl(root, 'PID');
  const messageType = firstEl(msh, 'MSH.9') ?? {};
  const msgCode = asText(firstEl(messageType, 'MSH.9.1') ?? messageType) ?? type;

  const base: ParsedMessage = {
    type: (['ORU', 'ADT', 'REF'].includes(msgCode) ? msgCode : type) as ParsedMessage['type'],
    healthlink_message_id:
      asText(firstEl(msh, 'MSH.10')) ?? undefined,
    source_hospital:
      asText(firstEl(msh, 'MSH.4')) ?? undefined,
    patient: pid
      ? {
          ihi:
            asText(firstEl(pid, 'PID.3')) ?? undefined,
          last_name:
            asText(firstEl(firstEl(pid, 'PID.5'), 'PID.5.1')) ?? undefined,
          first_name:
            asText(firstEl(firstEl(pid, 'PID.5'), 'PID.5.2')) ?? undefined,
          date_of_birth: normalizeDate(asText(firstEl(pid, 'PID.7'))),
        }
      : undefined,
  };

  if (base.type === 'ORU') return parseOru(root, base);
  if (base.type === 'ADT') return parseAdt(root, base);
  if (base.type === 'REF') return parseRef(root, base);
  return base;
}

// ORU^R01: observation results. OBX segments carry each test.
function parseOru(root: Record<string, unknown>, base: ParsedMessage): ParsedMessage {
  const results: NonNullable<ParsedMessage['results']> = [];
  const abnormalFlags: string[] = [];

  for (const obx of allEls(root, 'OBX')) {
    const test = asText(firstEl(firstEl(obx, 'OBX.3'), 'OBX.3.2'))
      ?? asText(firstEl(obx, 'OBX.3')) ?? 'Unknown test';
    const value = asText(firstEl(obx, 'OBX.5')) ?? '';
    const units = asText(firstEl(obx, 'OBX.6')) ?? undefined;
    const referenceRange = asText(firstEl(obx, 'OBX.7')) ?? undefined;
    const flag = asText(firstEl(obx, 'OBX.8')) ?? undefined;
    results.push({ test_name: test, value, units, reference_range: referenceRange, flag });
    // HL7 flags: H (high), L (low), A (abnormal), HH, LL, or prefixing N for normal.
    if (flag && /^[HLAX]/i.test(flag) && !/^N/i.test(flag)) {
      abnormalFlags.push(`${test}: ${flag.toUpperCase()}`);
    }
  }

  const summary = results
    .map((r) => `${r.test_name}: ${r.value}${r.units ?? ''}${r.reference_range ? ` (ref ${r.reference_range})` : ''}`)
    .join('\n');

  return { ...base, results, abnormal_flags: abnormalFlags, summary };
}

// ADT^A03/A08: discharge. Diagnosis from DGTA/DG1, medications from RXE/RXA,
// follow-up from the first NTE note.
function parseAdt(root: Record<string, unknown>, base: ParsedMessage): ParsedMessage {
  const dg1 = firstEl(root, 'DG1');
  const diagnosis = asText(firstEl(firstEl(dg1, 'DG1.4'), 'DG1.4.2'))
    ?? asText(firstEl(dg1, 'DG1.4')) ?? undefined;

  const rxe = allEls(root, 'RXE').length ? allEls(root, 'RXE') : allEls(root, 'RXA');
  const medications = rxe
    .map((seg) => asText(firstEl(seg, 'RXE.2')) ?? asText(firstEl(seg, 'RXA.2')))
    .filter((m): m is string => Boolean(m))
    .join('; ') || undefined;

  const nte = firstEl(allEls(root, 'NTE')[0], 'NTE.3')
    ?? allEls(root, 'NTE')[0];
  const followUp = asText(nte) ?? undefined;

  return { ...base, diagnosis, medications, follow_up: followUp, urgent: false };
}

// REF^I12: referral acknowledgement. RF1 carries status; appointment date
// from the first SCH/APPT-style segment if present.
function parseRef(root: Record<string, unknown>, base: ParsedMessage): ParsedMessage {
  const rf1 = firstEl(root, 'RF1');
  const refId = asText(firstEl(firstEl(rf1, 'RF1.2'), 'RF1.2.1'))
    ?? asText(firstEl(rf1, 'RF1.2')) ?? undefined;

  const appointmentDate = normalizeDate(
    asText(firstEl(firstEl(root, 'SCH'), 'SCH.11')) ?? undefined
  );

  const noteSeg = allEls(root, 'NTE')[0];
  const note = asText(firstEl(noteSeg, 'NTE.3') ?? noteSeg) ?? undefined;

  return {
    ...base,
    healthlink_ref: refId ?? base.healthlink_message_id,
    hospital: base.source_hospital,
    appointment_date: appointmentDate,
    note,
  };
}

// HL7 dates are YYYYMMDD; the ingest API wants ISO YYYY-MM-DD.
function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
