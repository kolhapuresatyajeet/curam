export type Role = 'gp' | 'nurse' | 'pm' | 'receptionist' | 'hca' | 'locum';

export type ModuleId =
  | 'dashboard'
  | 'calendar'
  | 'healthlink'
  | 'inbox'
  | 'patients'
  | 'prescriptions'
  | 'cdm'
  | 'referrals'
  | 'billing'
  | 'sile'
  | 'insights'
  | 'staff'
  | 'workflows'
  | 'settings';

export type Tone = 'teal' | 'blue' | 'amber' | 'purple' | 'coral' | 'slate';

export type MedicalCardType = 'gms' | 'gp_visit' | 'none';
export type SmokingStatus = 'never' | 'ex' | 'current' | 'unknown';
export type Gender = 'female' | 'male' | 'other' | 'unknown';

export type AppointmentType =
  | 'routine'
  | 'urgent'
  | 'cdm'
  | 'nurse'
  | 'phone'
  | 'video'
  | 'home_visit'
  | 'vaccination';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'dna'
  | 'cancelled';

export type BillingSource = 'gms' | 'private' | 'vhi' | 'laya' | 'irish_life' | 'aviva';
export type InvoiceStatus = 'unbilled' | 'invoiced' | 'paid' | 'partial' | 'rejected';
export type PcrsStatus = 'staged' | 'submitted' | 'accepted' | 'rejected' | 'paid';
export type InboxChannel = 'healthlink' | 'healthmail' | 'patient_app' | 'sile_draft' | 'internal';
export type MessageType =
  | 'lab_result'
  | 'discharge'
  | 'referral_ack'
  | 'radiology'
  | 'patient_msg'
  | 'healthmail'
  | 'sile_draft'
  | 'internal';

export type ConsultationTemplate = 'gp_consult' | 'phone_triage' | 'nurse_clinic' | 'home_visit';
export type ConsultationStatus = 'draft' | 'signed';
export type PrescriptionStatus = 'active' | 'expired' | 'cancelled';
export type RepeatStatus = 'pending' | 'approved' | 'rejected' | 'sent';
export type ReferralStatus =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'appointment_given'
  | 'under_care'
  | 'discharged';
export type CdmCondition = 'dm2' | 'copd' | 'asthma' | 'hf' | 'ihd' | 'stroke_tia' | 'af' | 'htn';
export type ResultDelivery = 'sile' | 'call' | 'app' | 'none';

export interface Practice {
  id: string;
  name: string;
  address: string;
  eircode: string;
  phone: string;
  healthlinkId: string;
  healthmail: string;
  pcrsReg: string;
  stripeAccountId: string;
  hours: string;
}

export interface Staff {
  id: string;
  practiceId: string;
  name: string;
  role: Role;
  email: string;
  phone: string;
  sessions: string;
  permissions: string[];
  initials: string;
  title: string;
  colour: Tone;
  patientPanel?: number;
  active: boolean;
  googleEmail?: string;
  googleCalendarId?: string;
  googleCalendarSummary?: string;
}

export interface Patient {
  id: string;
  practiceId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: Gender;
  ppsNumber: string;
  gmsNumber: string;
  ihiNumber: string;
  medicalCardType: MedicalCardType;
  phone: string;
  email: string;
  address: string;
  eircode: string;
  pharmacyName: string;
  pharmacyHealthmail: string;
  allergies: string;
  smokingStatus: SmokingStatus;
  gdprConsent: boolean;
  sileConsent: boolean;
  insurer?: BillingSource;
  colour: Tone;
  createdAt: string;
}

export interface PatientCondition {
  id: string;
  patientId: string;
  conditionCode: string;
  conditionName: string;
  codingSystem: 'icpc2' | 'icd10' | 'snomed';
  status: 'active' | 'resolved';
  diagnosedDate: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  staffId: string;
  appointmentId?: string;
  templateType: ConsultationTemplate;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icpc2Codes: string[];
  aiScribeUsed: boolean;
  aiTranscript: string;
  aiDraftNote?: Partial<Pick<Consultation, 'subjective' | 'objective' | 'assessment' | 'plan'>>;
  status: ConsultationStatus;
  signedAt?: string;
  createdAt: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  staffId: string;
  consultationId?: string;
  drugName: string;
  dose: string;
  frequency: string;
  durationMonths: number;
  pharmacyHealthmail: string;
  healthmailSentAt?: string;
  status: PrescriptionStatus;
  refillsRemaining: number;
  controlled: boolean;
}

export interface RepeatRxRequest {
  id: string;
  patientId: string;
  prescriptionId?: string;
  medicine: string;
  requestedVia: 'app' | 'sile' | 'reception';
  status: RepeatStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  requestedAt: string;
}

export interface LabResult {
  id: string;
  patientId: string;
  staffId: string;
  sourceHospital: string;
  healthlinkMessageId: string;
  resultsJson: { name: string; value: string; range: string; flag?: 'H' | 'L' | 'N' }[];
  abnormalFlags: string[];
  gpReviewed: boolean;
  gpComment: string;
  deliveryMethod: ResultDelivery;
  deliveredAt?: string;
  receivedAt: string;
  preview: string;
}

export interface Referral {
  id: string;
  patientId: string;
  staffId: string;
  consultationId?: string;
  specialty: string;
  hospital: string;
  healthlinkRef?: string;
  status: ReferralStatus;
  sileDrafted: boolean;
  notes: string;
  sentAt?: string;
}

export interface CdmEnrolment {
  id: string;
  patientId: string;
  condition: CdmCondition;
  enrolledDate: string;
  consentSigned: boolean;
  status: 'active' | 'withdrawn';
}

export interface CdmReview {
  id: string;
  patientId: string;
  enrolmentId: string;
  reviewerId: string;
  reviewType: 'nurse' | 'gp';
  reviewData: Record<string, string | number>;
  cdrSubmitted: boolean;
  cdrSubmissionId?: string;
  pcrsClaimId?: string;
  completedAt?: string;
  nurseSigned: boolean;
  gpSigned: boolean;
}

export interface Appointment {
  id: string;
  practiceId: string;
  patientId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  bookedVia: 'online' | 'reception' | 'sile';
  sileTriageNotes: string;
  reminderSent: boolean;
}

export interface WaitingRoomEntry {
  id: string;
  appointmentId: string;
  arrivedAt: string;
  calledInAt?: string;
  completedAt?: string;
  waitMinutes: number;
}

export interface Invoice {
  id: string;
  practiceId: string;
  patientId: string;
  appointmentId?: string;
  staffId: string;
  billingSource: BillingSource;
  amount: number;
  paidAmount: number;
  status: InvoiceStatus;
  pcrsClaimId?: string;
  insurerClaimRef?: string;
  stripePaymentId?: string;
  issuedAt: string;
}

export interface PcrsClaim {
  id: string;
  practiceId: string;
  patientId: string;
  invoiceId: string;
  stcCode: string;
  submissionDate: string;
  status: PcrsStatus;
  rejectionReason?: string;
}

export interface InboxMessage {
  id: string;
  practiceId: string;
  channel: InboxChannel;
  fromName: string;
  fromAddress: string;
  patientId?: string;
  subject: string;
  body: string;
  messageType: MessageType;
  assignedTo?: string;
  read: boolean;
  urgent: boolean;
  receivedAt: string;
}

export interface SmsLog {
  id: string;
  patientId: string;
  direction: 'outbound' | 'inbound';
  message: string;
  status: 'sent' | 'delivered' | 'failed';
  sentAt: string;
}

export interface WorkflowDefinition {
  id: string;
  practiceId: string;
  name: string;
  triggerEvent: string;
  conditions: string;
  actions: string[];
  active: boolean;
  runCount: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  patientId?: string;
  triggerData: string;
  actionsExecuted: string[];
  result: 'ok' | 'error';
  error?: string;
  ranAt: string;
}

export interface SileCall {
  id: string;
  practiceId: string;
  patientId?: string;
  direction: 'inbound' | 'outbound';
  purpose: 'booking' | 'results' | 'cdm_recall' | 'payment' | 'other';
  transcript: string;
  outcome: string;
  durationSeconds: number;
  recordingUrl?: string;
  createdAt: string;
  live?: boolean;
}

export interface AuditLogEntry {
  id: string;
  practiceId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  patientId?: string;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface Vaccine {
  id: string;
  patientId: string;
  name: string;
  givenAt: string;
  batch?: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  kind: string;
  createdAt: string;
}

export interface HealthmailDirectoryEntry {
  id: string;
  name: string;
  address: string;
  kind: 'pharmacy' | 'gp' | 'hospital';
}

export interface TimelineEvent {
  id: string;
  patientId: string;
  at: string;
  title: string;
  detail: string;
  kind: string;
}

export interface PracticeState {
  practice: Practice;
  staff: Staff[];
  patients: Patient[];
  conditions: PatientCondition[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  repeatRequests: RepeatRxRequest[];
  labResults: LabResult[];
  referrals: Referral[];
  cdmEnrolments: CdmEnrolment[];
  cdmReviews: CdmReview[];
  appointments: Appointment[];
  waitingRoom: WaitingRoomEntry[];
  invoices: Invoice[];
  pcrsClaims: PcrsClaim[];
  inbox: InboxMessage[];
  smsLog: SmsLog[];
  workflows: WorkflowDefinition[];
  workflowRuns: WorkflowRun[];
  sileCalls: SileCall[];
  auditLog: AuditLogEntry[];
  vaccines: Vaccine[];
  documents: PatientDocument[];
  healthmailDirectory: HealthmailDirectoryEntry[];
  session: { staffId: string; expiresAt: number } | null;
}

export function patientName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}
