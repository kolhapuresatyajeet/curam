import type { ParsedHealthLinkMessage } from '@/types/healthlink';

export function parseHl7Xml(xml: string): ParsedHealthLinkMessage {
  const typeMatch = xml.match(/<MSH\.9\.1>(ORU|ADT|REF)</);
  const sourceMatch = xml.match(/<MSH\.4>([^<]+)</);
  return {
    id: `hl7_${Date.now()}`,
    type: (typeMatch?.[1] as ParsedHealthLinkMessage['type']) ?? 'ORU',
    source: sourceMatch?.[1] ?? 'Unknown',
    receivedAt: new Date().toISOString(),
    rawXml: xml,
  };
}
