import { useSyncExternalStore } from 'react';
import { createAuditEntry } from '@/lib/audit';
import { createSeedState } from '@/data/seed';
import { formatPrescriptionEmail } from '@/lib/healthmail';
import { detectEmergency } from '@/lib/sile';
import { draftSoapFromTranscript, suggestIcpc2 } from '@/lib/ai-scribe';
import { detectBillingSource } from '@/lib/stripe';
import { id, nowIso } from '@/lib/utils';
import type {
  Appointment,
  AppointmentStatus,
  Consultation,
  Invoice,
  LabResult,
  Patient,
  PracticeState,
  RepeatRxRequest,
  Staff,
  WaitingRoomEntry,
} from '@/types/domain';

const KEY = 'curam-practice-state-v1';
const SESSION_MS = 30 * 60 * 1000;

let state: PracticeState = load();
const listeners = new Set<() => void>();

function load(): PracticeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as PracticeState;
  } catch {
    /* empty */
  }
  return createSeedState();
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn());
}

function setState(updater: (current: PracticeState) => PracticeState) {
  state = updater(state);
  persist();
}

function audit(action: string, entityType: string, entityId: string, patientId?: string, details?: Record<string, unknown>) {
  const userId = state.session?.staffId ?? 'system';
  state = {
    ...state,
    auditLog: [createAuditEntry({ practiceId: state.practice.id, userId, action, entityType, entityId, patientId, details }), ...state.auditLog],
  };
}

function runWorkflow(triggerEvent: string, patientId?: string, extra?: string) {
  const matching = state.workflows.filter((wf) => wf.active && wf.triggerEvent === triggerEvent);
  const runs = matching.map((wf) => {
    const executed = [...wf.actions];
    return {
      id: id('wfr'),
      workflowId: wf.id,
      patientId,
      triggerData: extra ?? triggerEvent,
      actionsExecuted: executed,
      result: 'ok' as const,
      ranAt: nowIso(),
    };
  });
  if (!runs.length) return;
  state = {
    ...state,
    workflows: state.workflows.map((wf) =>
      matching.some((m) => m.id === wf.id) ? { ...wf, runCount: wf.runCount + 1 } : wf,
    ),
    workflowRuns: [...runs, ...state.workflowRuns],
  };
}

export const appStore = {
  get: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  resetDemo() {
    state = createSeedState();
    persist();
  },
  login(staffId: string) {
    setState((current) => ({
      ...current,
      session: { staffId, expiresAt: Date.now() + SESSION_MS },
    }));
    audit('login', 'session', staffId);
  },
  logout() {
    audit('logout', 'session', state.session?.staffId ?? 'none');
    setState((current) => ({ ...current, session: null }));
  },
  touchSession() {
    if (!state.session) return;
    if (Date.now() > state.session.expiresAt) {
      appStore.logout();
      return;
    }
    setState((current) =>
      current.session ? { ...current, session: { ...current.session, expiresAt: Date.now() + SESSION_MS } } : current,
    );
  },
  switchStaff(staffId: string) {
    setState((current) => ({
      ...current,
      session: { staffId, expiresAt: Date.now() + SESSION_MS },
    }));
  },
  updatePractice(patch: Partial<PracticeState['practice']>) {
    setState((current) => ({ ...current, practice: { ...current.practice, ...patch } }));
    audit('update', 'practice', state.practice.id, undefined, patch as Record<string, unknown>);
  },
  upsertStaff(member: Staff) {
    setState((current) => {
      const exists = current.staff.some((item) => item.id === member.id);
      return {
        ...current,
        staff: exists ? current.staff.map((item) => (item.id === member.id ? member : item)) : [...current.staff, member],
      };
    });
    audit('upsert', 'staff', member.id);
  },
  registerPatient(input: Omit<Patient, 'id' | 'practiceId' | 'createdAt' | 'colour'> & { colour?: Patient['colour'] }) {
    const patient: Patient = {
      ...input,
      id: crypto.randomUUID(),
      practiceId: state.practice.id,
      createdAt: nowIso(),
      colour: input.colour ?? 'teal',
    };
    setState((current) => ({ ...current, patients: [patient, ...current.patients] }));
    audit('create', 'patient', patient.id, patient.id);
    return patient;
  },
  mergePatients(patients: Patient[]) {
    setState((current) => {
      const map = new Map(current.patients.map((item) => [item.id, item]));
      patients.forEach((item) => map.set(item.id, item));
      return { ...current, patients: [...map.values()] };
    });
  },
  updatePatient(patientId: string, patch: Partial<Patient>) {
    setState((current) => ({
      ...current,
      patients: current.patients.map((item) => (item.id === patientId ? { ...item, ...patch } : item)),
    }));
    audit('update', 'patient', patientId, patientId, patch as Record<string, unknown>);
  },
  bookAppointment(input: Omit<Appointment, 'id' | 'practiceId' | 'reminderSent'>) {
    const appointment: Appointment = { ...input, id: crypto.randomUUID(), practiceId: state.practice.id, reminderSent: false };
    setState((current) => ({ ...current, appointments: [...current.appointments, appointment] }));
    audit('create', 'appointment', appointment.id, appointment.patientId);
    runWorkflow('appointment.created', appointment.patientId, appointment.id);
    persist();
    return appointment;
  },
  setSchedule(appointments: Appointment[], waitingRoom: WaitingRoomEntry[]) {
    setState((current) => ({ ...current, appointments, waitingRoom }));
  },
  mergeAppointments(items: Appointment[]) {
    setState((current) => {
      const map = new Map(current.appointments.map((item) => [item.id, item]));
      items.forEach((item) => map.set(item.id, item));
      return { ...current, appointments: [...map.values()] };
    });
  },
  setAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
    const existing = state.appointments.find((item) => item.id === appointmentId);
    setState((current) => ({
      ...current,
      appointments: current.appointments.map((item) => (item.id === appointmentId ? { ...item, status } : item)),
    }));
    audit('update', 'appointment', appointmentId, existing?.patientId, { status });
    if (status === 'dna' && existing) {
      runWorkflow('appointment.dna', existing.patientId, appointmentId);
      persist();
    }
    if (status === 'checked_in' && existing) {
      const entry = {
        id: id('w'),
        appointmentId,
        arrivedAt: nowIso(),
        waitMinutes: 0,
      };
      setState((current) => ({ ...current, waitingRoom: [...current.waitingRoom.filter((w) => w.appointmentId !== appointmentId), entry] }));
    }
    if (status === 'completed' && existing) {
      const patient = state.patients.find((item) => item.id === existing.patientId);
      const source = detectBillingSource(patient?.medicalCardType ?? 'none', patient?.insurer);
      const amount = source === 'gms' ? 0 : 65;
      const invoice: Invoice = {
        id: id('inv'),
        practiceId: state.practice.id,
        patientId: existing.patientId,
        appointmentId,
        staffId: existing.staffId,
        billingSource: source,
        amount,
        paidAmount: 0,
        status: amount === 0 ? 'invoiced' : 'unbilled',
        issuedAt: nowIso(),
      };
      setState((current) => ({
        ...current,
        invoices: [invoice, ...current.invoices],
        waitingRoom: current.waitingRoom.map((w) =>
          w.appointmentId === appointmentId ? { ...w, completedAt: nowIso() } : w,
        ),
      }));
      audit('create', 'invoice', invoice.id, existing.patientId);
    }
  },
  callIn(appointmentId: string) {
    setState((current) => ({
      ...current,
      waitingRoom: current.waitingRoom.map((w) => {
        if (w.appointmentId !== appointmentId) return w;
        const wait = Math.round((Date.now() - new Date(w.arrivedAt).getTime()) / 60000);
        return { ...w, calledInAt: nowIso(), waitMinutes: wait };
      }),
      appointments: current.appointments.map((item) =>
        item.id === appointmentId ? { ...item, status: 'in_progress' } : item,
      ),
    }));
    audit('call_in', 'waiting_room', appointmentId);
  },
  markInboxRead(messageId: string) {
    setState((current) => ({
      ...current,
      inbox: current.inbox.map((item) => (item.id === messageId ? { ...item, read: true } : item)),
    }));
    audit('read', 'inbox_message', messageId);
  },
  sendInbox(input: { fromName: string; subject: string; body: string; patientId?: string }) {
    const message = {
      id: id('m'),
      practiceId: state.practice.id,
      channel: 'internal' as const,
      fromName: input.fromName,
      fromAddress: 'internal',
      patientId: input.patientId,
      subject: input.subject,
      body: input.body,
      messageType: 'internal' as const,
      read: false,
      urgent: false,
      receivedAt: nowIso(),
    };
    setState((current) => ({ ...current, inbox: [message, ...current.inbox] }));
    audit('create', 'inbox_message', message.id, input.patientId);
  },
  approveRepeat(requestId: string, staffId: string) {
    const request = state.repeatRequests.find((item) => item.id === requestId);
    if (!request) return { ok: false, error: 'Request not found' };
    const role = state.staff.find((item) => item.id === staffId)?.role;
    if (role !== 'gp' && role !== 'locum') return { ok: false, error: 'Prescriptions require GP approval' };
    setState((current) => ({
      ...current,
      repeatRequests: current.repeatRequests.map((item) =>
        item.id === requestId
          ? { ...item, status: 'approved', reviewedBy: staffId, reviewedAt: nowIso() }
          : item,
      ),
    }));
    audit('approve', 'repeat_rx', requestId, request.patientId);
    return { ok: true as const };
  },
  sendRepeatHealthmail(requestId: string) {
    const request = state.repeatRequests.find((item) => item.id === requestId);
    if (!request || request.status !== 'approved') return { ok: false, error: 'GP approval required before send' };
    const patient = state.patients.find((item) => item.id === request.patientId);
    const gp = state.staff.find((item) => item.id === request.reviewedBy);
    if (patient && gp) {
      formatPrescriptionEmail({
        practiceName: state.practice.name,
        gpName: gp.name,
        patientName: `${patient.firstName} ${patient.lastName}`,
        dob: patient.dob,
        drugName: request.medicine,
        dose: '',
        frequency: '',
        durationMonths: 1,
      });
    }
    setState((current) => ({
      ...current,
      repeatRequests: current.repeatRequests.map((item) =>
        item.id === requestId ? { ...item, status: 'sent' } : item,
      ),
    }));
    audit('send_healthmail', 'repeat_rx', requestId, request.patientId);
    runWorkflow('repeat_rx.requested', request.patientId, requestId);
    persist();
    return { ok: true as const };
  },
  requestRepeat(input: Omit<RepeatRxRequest, 'id' | 'status' | 'requestedAt'> & { status?: RepeatRxRequest['status'] }) {
    const request: RepeatRxRequest = {
      ...input,
      id: id('rr'),
      status: 'pending',
      requestedAt: nowIso(),
    };
    setState((current) => ({ ...current, repeatRequests: [request, ...current.repeatRequests] }));
    audit('create', 'repeat_rx', request.id, request.patientId);
    runWorkflow('repeat_rx.requested', request.patientId, request.id);
    persist();
    return request;
  },
  reviewLab(resultId: string, comment: string, delivery: LabResult['deliveryMethod']) {
    const lab = state.labResults.find((item) => item.id === resultId);
    if (!lab) return { ok: false, error: 'Not found' };
    if (lab.abnormalFlags.length && delivery === 'sile') {
      return { ok: false, error: 'Abnormal results cannot be delivered by Síle — GP callback only' };
    }
    setState((current) => ({
      ...current,
      labResults: current.labResults.map((item) =>
        item.id === resultId
          ? { ...item, gpReviewed: true, gpComment: comment, deliveryMethod: delivery, deliveredAt: delivery === 'none' ? undefined : nowIso() }
          : item,
      ),
    }));
    audit('review', 'lab_result', resultId, lab.patientId, { delivery });
    if (delivery === 'sile') {
      runWorkflow('lab_result.marked_normal', lab.patientId, resultId);
      persist();
    }
    return { ok: true as const };
  },
  saveConsultation(note: Consultation) {
    setState((current) => {
      const exists = current.consultations.some((item) => item.id === note.id);
      return {
        ...current,
        consultations: exists
          ? current.consultations.map((item) => (item.id === note.id ? note : item))
          : [note, ...current.consultations],
      };
    });
    audit(note.status === 'signed' ? 'sign' : 'save', 'consultation', note.id, note.patientId);
  },
  generateAiSoap(consultationId: string, transcript: string, patientId: string) {
    const patient = state.patients.find((item) => item.id === patientId);
    const conditions = state.conditions.filter((item) => item.patientId === patientId).map((item) => item.conditionName).join(', ');
    const meds = state.prescriptions.filter((item) => item.patientId === patientId).map((item) => item.drugName).join(', ');
    const context = `Allergies: ${patient?.allergies}. Conditions: ${conditions}. Meds: ${meds}.`;
    const draft = draftSoapFromTranscript(transcript, context);
    const codes = suggestIcpc2(`${transcript} ${context}`);
    setState((current) => ({
      ...current,
      consultations: current.consultations.map((item) =>
        item.id === consultationId
          ? { ...item, aiScribeUsed: true, aiTranscript: transcript, aiDraftNote: draft, icpc2Codes: codes }
          : item,
      ),
    }));
    audit('ai_draft', 'consultation', consultationId, patientId);
    return { draft, codes };
  },
  approveAiNote(consultationId: string) {
    setState((current) => ({
      ...current,
      consultations: current.consultations.map((item) => {
        if (item.id !== consultationId || !item.aiDraftNote) return item;
        return {
          ...item,
          subjective: item.aiDraftNote.subjective ?? item.subjective,
          objective: item.aiDraftNote.objective ?? item.objective,
          assessment: item.aiDraftNote.assessment ?? item.assessment,
          plan: item.aiDraftNote.plan ?? item.plan,
        };
      }),
    }));
    audit('ai_approve', 'consultation', consultationId);
  },
  toggleWorkflow(workflowId: string) {
    setState((current) => ({
      ...current,
      workflows: current.workflows.map((item) => (item.id === workflowId ? { ...item, active: !item.active } : item)),
    }));
    audit('toggle', 'workflow', workflowId);
  },
  logSileCall(input: Omit<PracticeState['sileCalls'][number], 'id' | 'practiceId' | 'createdAt'>) {
    if (detectEmergency(input.transcript)) {
      input = { ...input, outcome: `EMERGENCY: ${input.outcome}. Instructed to call 999/112.` };
    }
    const call = { ...input, id: id('sc'), practiceId: state.practice.id, createdAt: nowIso() };
    setState((current) => ({ ...current, sileCalls: [call, ...current.sileCalls] }));
    audit('create', 'sile_call', call.id, call.patientId);
    return call;
  },
  payInvoice(invoiceId: string, amount: number) {
    setState((current) => ({
      ...current,
      invoices: current.invoices.map((item) => {
        if (item.id !== invoiceId) return item;
        const paid = item.paidAmount + amount;
        return {
          ...item,
          paidAmount: paid,
          status: paid >= item.amount ? 'paid' : 'partial',
          stripePaymentId: `pi_${id('pay')}`,
        };
      }),
    }));
    audit('payment', 'invoice', invoiceId);
  },
  submitPcrs(claimId: string) {
    setState((current) => ({
      ...current,
      pcrsClaims: current.pcrsClaims.map((item) =>
        item.id === claimId ? { ...item, status: 'submitted', submissionDate: nowIso().slice(0, 10) } : item,
      ),
    }));
    audit('submit', 'pcrs_claim', claimId);
  },
  updateReferralStatus(referralId: string, status: PracticeState['referrals'][number]['status']) {
    setState((current) => ({
      ...current,
      referrals: current.referrals.map((item) => (item.id === referralId ? { ...item, status } : item)),
    }));
    audit('update', 'referral', referralId);
  },
  signCdmReview(reviewId: string, stage: 'nurse' | 'gp') {
    setState((current) => ({
      ...current,
      cdmReviews: current.cdmReviews.map((item) => {
        if (item.id !== reviewId) return item;
        const next = {
          ...item,
          nurseSigned: stage === 'nurse' ? true : item.nurseSigned,
          gpSigned: stage === 'gp' ? true : item.gpSigned,
        };
        if (next.nurseSigned && next.gpSigned) {
          next.completedAt = nowIso();
        }
        return next;
      }),
    }));
    audit('sign', 'cdm_review', reviewId, undefined, { stage });
  },
};

export function useAppState(): PracticeState {
  return useSyncExternalStore(appStore.subscribe, appStore.get, appStore.get);
}

export function useSessionStaff(): Staff | undefined {
  const data = useAppState();
  return data.staff.find((item) => item.id === data.session?.staffId);
}
