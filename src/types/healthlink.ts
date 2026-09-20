export type Hl7MessageType = 'ORU' | 'ADT' | 'REF';

export interface ParsedLabObservation {
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  abnormalFlag?: 'H' | 'L' | 'N';
}

export interface ParsedHealthLinkMessage {
  id: string;
  type: Hl7MessageType;
  source: string;
  patientName?: string;
  patientDob?: string;
  receivedAt: string;
  rawXml?: string;
  labs?: ParsedLabObservation[];
  diagnosis?: string;
  medications?: string[];
  followUp?: string;
  referralStatus?: string;
  appointmentDate?: string;
}
