export function parseMessage(xml: string) {
  const type = xml.includes('ORU') ? 'ORU' : xml.includes('ADT') ? 'ADT' : 'REF';
  return { type, xml, receivedAt: new Date().toISOString() };
}
