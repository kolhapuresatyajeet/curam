import type { PracticeState } from '@/types/domain';

const PRACTICE_ID = 'prac_riverside';

export function createSeedState(): PracticeState {
  return {
    practice: {
      id: PRACTICE_ID,
      name: 'Riverside Family Practice',
      address: '14 Cork Street, Dublin 8',
      eircode: 'D08 YX21',
      phone: '01 453 2100',
      healthlinkId: 'HL-D08-441',
      healthmail: 'riverside@healthmail.ie',
      pcrsReg: 'PCRS-88211',
      stripeAccountId: 'acct_demo_riverside',
      hours: 'Mon–Fri 08:30–18:00',
    },
    session: { staffId: 'st_sarah', expiresAt: Date.now() + 30 * 60 * 1000 },
    staff: [
      { id: 'st_sarah', practiceId: PRACTICE_ID, name: 'Dr Sarah Murphy', role: 'gp', email: 'sarah@riverside.ie', phone: '087 111 2200', sessions: 'Mon–Fri AM + PM', permissions: ['all'], initials: 'SM', title: 'GP Partner', colour: 'teal', patientPanel: 1420, active: true },
      { id: 'st_kevin', practiceId: PRACTICE_ID, name: "Dr Kevin O'Neill", role: 'gp', email: 'kevin@riverside.ie', phone: '087 111 2201', sessions: 'Mon–Thu AM + PM', permissions: ['clinical'], initials: 'KO', title: 'GP Salaried', colour: 'blue', patientPanel: 890, active: true },
      { id: 'st_aisling', practiceId: PRACTICE_ID, name: 'Aisling Brennan', role: 'nurse', email: 'aisling@riverside.ie', phone: '087 111 2202', sessions: 'Mon–Fri AM + PM', permissions: ['nursing', 'cdm'], initials: 'AB', title: 'Practice Nurse', colour: 'purple', active: true },
      { id: 'st_claire', practiceId: PRACTICE_ID, name: 'Claire Dempsey', role: 'pm', email: 'claire@riverside.ie', phone: '087 111 2203', sessions: 'Mon–Fri 08:00–17:00', permissions: ['ops', 'billing'], initials: 'CD', title: 'Practice Manager', colour: 'amber', active: true },
      { id: 'st_orla', practiceId: PRACTICE_ID, name: 'Orla Flood', role: 'receptionist', email: 'orla@riverside.ie', phone: '087 111 2204', sessions: 'Mon–Fri 08:00–17:00', permissions: ['front_desk'], initials: 'OF', title: 'Receptionist', colour: 'slate', active: true },
    ],
    patients: [
      { id: 'p1', practiceId: PRACTICE_ID, firstName: 'Mary', lastName: "O'Brien", dob: '1964-03-14', gender: 'female', ppsNumber: '1234567T', gmsNumber: 'GMS-441902', ihiNumber: '123456789012345678', medicalCardType: 'gms', phone: '087 221 3344', email: 'mary.obrien@example.ie', address: '22 Meath Street, Dublin 8', eircode: 'D08 AB12', pharmacyName: 'Boots Thomas Street', pharmacyHealthmail: 'boots.thomasst@healthmail.ie', allergies: 'Penicillin', smokingStatus: 'ex', gdprConsent: true, sileConsent: true, colour: 'teal', createdAt: '2018-04-12T09:00:00.000Z' },
      { id: 'p2', practiceId: PRACTICE_ID, firstName: 'Tom', lastName: 'Brennan', dob: '1959-11-26', gender: 'male', ppsNumber: '2234567T', gmsNumber: '', ihiNumber: '223456789012345678', medicalCardType: 'none', phone: '086 332 4455', email: 'tom.brennan@example.ie', address: '8 Francis Street, Dublin 8', eircode: 'D08 CD34', pharmacyName: 'Hickeys Pharmacy', pharmacyHealthmail: 'hickeys.d8@healthmail.ie', allergies: 'NKDA', smokingStatus: 'never', gdprConsent: true, sileConsent: true, insurer: 'vhi', colour: 'blue', createdAt: '2016-01-09T09:00:00.000Z' },
      { id: 'p3', practiceId: PRACTICE_ID, firstName: 'Aoife', lastName: 'Murphy', dob: '1992-01-05', gender: 'female', ppsNumber: '3234567T', gmsNumber: '', ihiNumber: '323456789012345678', medicalCardType: 'none', phone: '085 443 5566', email: 'aoife.murphy@example.ie', address: '19 Clanbrassil Street, Dublin 8', eircode: 'D08 EF56', pharmacyName: 'Boots Thomas Street', pharmacyHealthmail: 'boots.thomasst@healthmail.ie', allergies: 'NKDA', smokingStatus: 'never', gdprConsent: true, sileConsent: true, insurer: 'private', colour: 'amber', createdAt: '2020-06-21T09:00:00.000Z' },
      { id: 'p4', practiceId: PRACTICE_ID, firstName: 'Ciarán', lastName: 'Doyle', dob: '1951-08-22', gender: 'male', ppsNumber: '4234567T', gmsNumber: 'GMS-772001', ihiNumber: '423456789012345678', medicalCardType: 'gms', phone: '087 554 6677', email: 'ciaran.doyle@example.ie', address: '3 The Coombe, Dublin 8', eircode: 'D08 GH78', pharmacyName: 'Boots Thomas Street', pharmacyHealthmail: 'boots.thomasst@healthmail.ie', allergies: 'Aspirin', smokingStatus: 'ex', gdprConsent: true, sileConsent: true, colour: 'purple', createdAt: '2012-11-03T09:00:00.000Z' },
      { id: 'p5', practiceId: PRACTICE_ID, firstName: 'Eileen', lastName: 'Doyle', dob: '1947-06-17', gender: 'female', ppsNumber: '5234567T', gmsNumber: 'GMS-772002', ihiNumber: '523456789012345678', medicalCardType: 'gms', phone: '087 665 7788', email: 'eileen.doyle@example.ie', address: '3 The Coombe, Dublin 8', eircode: 'D08 GH78', pharmacyName: 'Boots Thomas Street', pharmacyHealthmail: 'boots.thomasst@healthmail.ie', allergies: 'NKDA', smokingStatus: 'never', gdprConsent: true, sileConsent: false, colour: 'coral', createdAt: '2012-11-03T09:00:00.000Z' },
      { id: 'p6', practiceId: PRACTICE_ID, firstName: 'Séamus', lastName: 'Walsh', dob: '1976-12-01', gender: 'male', ppsNumber: '6234567T', gmsNumber: '', ihiNumber: '623456789012345678', medicalCardType: 'none', phone: '086 776 8899', email: 'seamus.walsh@example.ie', address: '41 South Circular Road, Dublin 8', eircode: 'D08 IJ90', pharmacyName: 'Lloyds Pharmacy', pharmacyHealthmail: 'lloyds.scr@healthmail.ie', allergies: 'NKDA', smokingStatus: 'current', gdprConsent: true, sileConsent: true, colour: 'blue', createdAt: '2021-02-14T09:00:00.000Z' },
      { id: 'p7', practiceId: PRACTICE_ID, firstName: 'Margaret', lastName: 'Dunne', dob: '1958-09-08', gender: 'female', ppsNumber: '7234567T', gmsNumber: '', ihiNumber: '723456789012345678', medicalCardType: 'none', phone: '085 887 9900', email: 'margaret.dunne@example.ie', address: '7 Newmarket, Dublin 8', eircode: 'D08 KL12', pharmacyName: 'Hickeys Pharmacy', pharmacyHealthmail: 'hickeys.d8@healthmail.ie', allergies: 'NKDA', smokingStatus: 'never', gdprConsent: true, sileConsent: true, insurer: 'laya', colour: 'teal', createdAt: '2019-08-30T09:00:00.000Z' },
    ],
    conditions: [
      { id: 'c1', patientId: 'p1', conditionCode: 'T90', conditionName: 'Type 2 diabetes', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2015-03-01' },
      { id: 'c2', patientId: 'p1', conditionCode: 'K78', conditionName: 'Atrial fibrillation', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2019-07-12' },
      { id: 'c3', patientId: 'p2', conditionCode: 'K74', conditionName: 'Ischaemic heart disease', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2014-11-02' },
      { id: 'c4', patientId: 'p3', conditionCode: 'R96', conditionName: 'Asthma', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2006-05-18' },
      { id: 'c5', patientId: 'p4', conditionCode: 'T90', conditionName: 'Type 2 diabetes', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2010-01-20' },
      { id: 'c6', patientId: 'p4', conditionCode: 'K86', conditionName: 'Hypertension', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2008-09-09' },
      { id: 'c7', patientId: 'p5', conditionCode: 'K77', conditionName: 'Heart failure', codingSystem: 'icpc2', status: 'active', diagnosedDate: '2018-02-11' },
    ],
    consultations: [
      { id: 'con1', patientId: 'p1', staffId: 'st_sarah', templateType: 'gp_consult', subjective: 'Tiredness, polyuria.', objective: 'BMI 31. BP 138/84.', assessment: 'Suboptimal glycaemic control.', plan: 'Repeat HbA1c, lifestyle, review CDM.', icpc2Codes: ['T90'], aiScribeUsed: false, aiTranscript: '', status: 'signed', signedAt: '2024-08-12T10:20:00.000Z', createdAt: '2024-08-12T10:00:00.000Z' },
    ],
    prescriptions: [
      { id: 'rx1', patientId: 'p3', staffId: 'st_sarah', drugName: 'Salbutamol', dose: '100mcg', frequency: '2 puffs PRN', durationMonths: 6, pharmacyHealthmail: 'boots.thomasst@healthmail.ie', status: 'active', refillsRemaining: 3, controlled: false },
      { id: 'rx2', patientId: 'p5', staffId: 'st_sarah', drugName: 'Furosemide', dose: '80mg', frequency: 'once daily', durationMonths: 3, pharmacyHealthmail: 'boots.thomasst@healthmail.ie', status: 'active', refillsRemaining: 1, controlled: false },
      { id: 'rx3', patientId: 'p2', staffId: 'st_kevin', drugName: 'Warfarin', dose: 'as per INR', frequency: 'once daily', durationMonths: 12, pharmacyHealthmail: 'hickeys.d8@healthmail.ie', status: 'active', refillsRemaining: 5, controlled: true },
      { id: 'rx4', patientId: 'p7', staffId: 'st_sarah', drugName: 'Levothyroxine', dose: '50mcg', frequency: 'once daily', durationMonths: 12, pharmacyHealthmail: 'hickeys.d8@healthmail.ie', status: 'active', refillsRemaining: 8, controlled: false, healthmailSentAt: '2024-09-11T11:00:00.000Z' },
    ],
    repeatRequests: [
      { id: 'rr1', patientId: 'p3', prescriptionId: 'rx1', medicine: 'Salbutamol 100mcg', requestedVia: 'app', status: 'pending', requestedAt: new Date().toISOString() },
      { id: 'rr2', patientId: 'p1', medicine: 'Metformin 1g', requestedVia: 'app', status: 'pending', requestedAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'rr3', patientId: 'p7', prescriptionId: 'rx4', medicine: 'Levothyroxine 50mcg', requestedVia: 'sile', status: 'sent', requestedAt: '2024-09-11T09:00:00.000Z', reviewedBy: 'st_sarah', reviewedAt: '2024-09-11T11:00:00.000Z' },
    ],
    labResults: [
      { id: 'lab1', patientId: 'p1', staffId: 'st_sarah', sourceHospital: 'St Vincent’s', healthlinkMessageId: 'HL-991', resultsJson: [{ name: 'HbA1c', value: '8.2%', range: '<7.0%', flag: 'H' }, { name: 'Chol', value: '5.8', range: '<5.0', flag: 'H' }], abnormalFlags: ['HbA1c', 'Chol'], gpReviewed: false, gpComment: '', deliveryMethod: 'none', receivedAt: new Date().toISOString(), preview: 'HbA1c 8.2% (H), U&E, Lipids — chol 5.8 (H)' },
      { id: 'lab2', patientId: 'p2', staffId: 'st_kevin', sourceHospital: 'Mater Hospital', healthlinkMessageId: 'HL-992', resultsJson: [{ name: 'INR', value: '3.8', range: '2.0–3.0', flag: 'H' }], abnormalFlags: ['INR'], gpReviewed: false, gpComment: '', deliveryMethod: 'none', receivedAt: new Date(Date.now() - 3600000).toISOString(), preview: 'INR 3.8 (H) — above therapeutic range' },
      { id: 'lab3', patientId: 'p6', staffId: 'st_sarah', sourceHospital: 'St James’s', healthlinkMessageId: 'HL-993', resultsJson: [{ name: 'FBC', value: 'NAD', range: 'normal', flag: 'N' }], abnormalFlags: [], gpReviewed: true, gpComment: 'All within normal range.', deliveryMethod: 'sile', deliveredAt: new Date(Date.now() - 86400000).toISOString(), receivedAt: new Date(Date.now() - 90000000).toISOString(), preview: 'FBC, TFT, LFT — all within normal range' },
    ],
    referrals: [
      { id: 'ref1', patientId: 'p6', staffId: 'st_sarah', specialty: 'Cardiology', hospital: 'Mater Hospital', status: 'acknowledged', sileDrafted: false, notes: 'Waiting list 4–6 weeks', sentAt: '2024-09-12T09:00:00.000Z', healthlinkRef: 'REF-MAT-441' },
      { id: 'ref2', patientId: 'p1', staffId: 'st_sarah', specialty: 'Dietetics', hospital: 'Community', status: 'sent', sileDrafted: false, notes: 'CDM dietetic support', sentAt: '2024-09-13T09:00:00.000Z' },
      { id: 'ref3', patientId: 'p2', staffId: 'st_kevin', specialty: 'Anticoagulation', hospital: 'Mater Hospital', status: 'draft', sileDrafted: true, notes: 'Routine referral draft by Síle' },
    ],
    cdmEnrolments: [
      { id: 'cdm1', patientId: 'p1', condition: 'dm2', enrolledDate: '2022-01-15', consentSigned: true, status: 'active' },
      { id: 'cdm2', patientId: 'p4', condition: 'dm2', enrolledDate: '2021-03-02', consentSigned: true, status: 'active' },
      { id: 'cdm3', patientId: 'p2', condition: 'ihd', enrolledDate: '2022-06-10', consentSigned: true, status: 'active' },
      { id: 'cdm4', patientId: 'p5', condition: 'hf', enrolledDate: '2023-01-08', consentSigned: true, status: 'active' },
    ],
    cdmReviews: [
      { id: 'cdmr1', patientId: 'p1', enrolmentId: 'cdm1', reviewerId: 'st_aisling', reviewType: 'nurse', reviewData: { hba1c: '8.2', bp: '138/84', bmi: '31' }, cdrSubmitted: false, nurseSigned: true, gpSigned: false },
    ],
    appointments: [
      { id: 'a1', practiceId: PRACTICE_ID, patientId: 'p4', staffId: 'st_sarah', startTime: todayAt(8, 30), endTime: todayAt(8, 50), type: 'cdm', status: 'checked_in', bookedVia: 'sile', sileTriageNotes: 'CDM review due', reminderSent: true },
      { id: 'a2', practiceId: PRACTICE_ID, patientId: 'p3', staffId: 'st_sarah', startTime: todayAt(8, 50), endTime: todayAt(9, 10), type: 'routine', status: 'confirmed', bookedVia: 'online', sileTriageNotes: '', reminderSent: true },
      { id: 'a3', practiceId: PRACTICE_ID, patientId: 'p2', staffId: 'st_kevin', startTime: todayAt(9, 10), endTime: todayAt(9, 30), type: 'nurse', status: 'confirmed', bookedVia: 'reception', sileTriageNotes: '', reminderSent: true },
      { id: 'a4', practiceId: PRACTICE_ID, patientId: 'p1', staffId: 'st_aisling', startTime: todayAt(9, 50), endTime: todayAt(10, 20), type: 'cdm', status: 'scheduled', bookedVia: 'sile', sileTriageNotes: 'Recall booked', reminderSent: false },
      { id: 'a5', practiceId: PRACTICE_ID, patientId: 'p5', staffId: 'st_sarah', startTime: todayAt(10, 10), endTime: todayAt(10, 30), type: 'urgent', status: 'confirmed', bookedVia: 'reception', sileTriageNotes: '', reminderSent: true },
      { id: 'a6', practiceId: PRACTICE_ID, patientId: 'p6', staffId: 'st_sarah', startTime: todayAt(11, 0), endTime: todayAt(11, 20), type: 'phone', status: 'scheduled', bookedVia: 'sile', sileTriageNotes: 'Chest pain screening negative', reminderSent: false },
    ],
    waitingRoom: [
      { id: 'w1', appointmentId: 'a1', arrivedAt: todayAt(8, 18), waitMinutes: 12 },
    ],
    invoices: [
      { id: 'inv1', practiceId: PRACTICE_ID, patientId: 'p3', appointmentId: 'a2', staffId: 'st_sarah', billingSource: 'private', amount: 65, paidAmount: 0, status: 'invoiced', issuedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
      { id: 'inv2', practiceId: PRACTICE_ID, patientId: 'p2', staffId: 'st_kevin', billingSource: 'vhi', amount: 80, paidAmount: 80, status: 'paid', insurerClaimRef: 'VHI-4411', issuedAt: new Date().toISOString(), stripePaymentId: 'pi_demo_1' },
      { id: 'inv3', practiceId: PRACTICE_ID, patientId: 'p1', staffId: 'st_sarah', billingSource: 'gms', amount: 40, paidAmount: 0, status: 'invoiced', pcrsClaimId: 'pcrs1', issuedAt: new Date().toISOString() },
    ],
    pcrsClaims: [
      { id: 'pcrs1', practiceId: PRACTICE_ID, patientId: 'p1', invoiceId: 'inv3', stcCode: 'STC01', submissionDate: new Date().toISOString().slice(0, 10), status: 'submitted' },
      { id: 'pcrs2', practiceId: PRACTICE_ID, patientId: 'p4', invoiceId: 'inv3', stcCode: 'STC-CDM', submissionDate: new Date().toISOString().slice(0, 10), status: 'rejected', rejectionReason: 'Medical card expired' },
    ],
    inbox: [
      { id: 'm1', practiceId: PRACTICE_ID, channel: 'patient_app', fromName: 'Aoife Murphy', fromAddress: 'app', patientId: 'p3', subject: 'Repeat Rx request', body: 'Can I get a repeat for my inhaler?', messageType: 'patient_msg', read: false, urgent: false, receivedAt: new Date().toISOString() },
      { id: 'm2', practiceId: PRACTICE_ID, channel: 'sile_draft', fromName: 'Síle', fromAddress: 'sile', patientId: 'p6', subject: 'Referral letter draft', body: 'Síle drafted referral to Mater Cardiology. Ready for review.', messageType: 'sile_draft', read: false, urgent: false, receivedAt: new Date().toISOString() },
      { id: 'm3', practiceId: PRACTICE_ID, channel: 'healthmail', fromName: 'Boots Pharmacy', fromAddress: 'boots.thomasst@healthmail.ie', patientId: 'p1', subject: 'Metformin query', body: 'Confirming dose change to 1g BD?', messageType: 'healthmail', read: false, urgent: false, receivedAt: new Date().toISOString() },
      { id: 'm4', practiceId: PRACTICE_ID, channel: 'internal', fromName: 'Aisling Brennan', fromAddress: 'internal', patientId: 'p1', subject: 'CDM query', body: 'Should I repeat HbA1c for Mary O’Brien at her CDM review?', messageType: 'internal', assignedTo: 'st_sarah', read: false, urgent: false, receivedAt: new Date().toISOString() },
      { id: 'm5', practiceId: PRACTICE_ID, channel: 'patient_app', fromName: 'Conor Ryan', fromAddress: 'app', subject: 'Reschedule request', body: 'Need to reschedule Thursday.', messageType: 'patient_msg', read: false, urgent: false, receivedAt: new Date().toISOString() },
    ],
    smsLog: [
      { id: 'sms1', patientId: 'p3', direction: 'outbound', message: 'Reminder: appointment tomorrow 08:50 at Riverside Family Practice.', status: 'delivered', sentAt: new Date(Date.now() - 3600000).toISOString() },
    ],
    workflows: [
      { id: 'wf1', practiceId: PRACTICE_ID, name: 'Appointment reminder → SMS 48h + 2h', triggerEvent: 'appointment.created', conditions: 'status in scheduled,confirmed', actions: ['sms.48h', 'sms.2h', 'sile.call.24h_if_unconfirmed'], active: true, runCount: 462 },
      { id: 'wf2', practiceId: PRACTICE_ID, name: 'Lab result routing → ordering GP', triggerEvent: 'lab_result.received', conditions: 'always', actions: ['route.ordering_gp', 'flag.abnormal', 'sms.if_critical'], active: true, runCount: 89 },
      { id: 'wf3', practiceId: PRACTICE_ID, name: 'Repeat Rx → queue → approve → Healthmail', triggerEvent: 'repeat_rx.requested', conditions: 'never auto-approve', actions: ['queue.gp', 'await.approval', 'healthmail.send'], active: true, runCount: 86 },
      { id: 'wf4', practiceId: PRACTICE_ID, name: 'Payment reminder → SMS → Síle call', triggerEvent: 'invoice.unpaid_7d', conditions: 'status invoiced', actions: ['sms.payment_link', 'sile.call.14d'], active: true, runCount: 42 },
      { id: 'wf5', practiceId: PRACTICE_ID, name: 'No-show follow-up', triggerEvent: 'appointment.dna', conditions: 'status dna', actions: ['sms.sorry_missed_you'], active: true, runCount: 18 },
      { id: 'wf6', practiceId: PRACTICE_ID, name: 'Normal result → Síle delivery', triggerEvent: 'lab_result.marked_normal', conditions: 'no abnormal flags', actions: ['queue.sile_outbound'], active: true, runCount: 55 },
      { id: 'wf7', practiceId: PRACTICE_ID, name: 'CDM recall sequence', triggerEvent: 'cdm.due_in_14d', conditions: 'enrolment active', actions: ['sms.recall', 'app.notify', 'sile.call'], active: false, runCount: 34 },
    ],
    workflowRuns: [
      { id: 'wfr1', workflowId: 'wf1', patientId: 'p3', triggerData: 'appointment a2', actionsExecuted: ['sms.48h'], result: 'ok', ranAt: new Date().toISOString() },
    ],
    sileCalls: [
      { id: 'sc1', practiceId: PRACTICE_ID, patientId: 'p3', direction: 'inbound', purpose: 'booking', transcript: 'Hi, I need an inhaler review please.', outcome: 'Booked 08:50', durationSeconds: 98, createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'sc2', practiceId: PRACTICE_ID, patientId: 'p6', direction: 'outbound', purpose: 'results', transcript: 'Your bloods are back and they are normal.', outcome: 'Result delivered', durationSeconds: 74, createdAt: new Date(Date.now() - 90000000).toISOString() },
    ],
    auditLog: [
      { id: 'aud1', practiceId: PRACTICE_ID, userId: 'st_sarah', action: 'login', entityType: 'session', entityId: 'sess1', details: {}, ipAddress: '127.0.0.1', createdAt: new Date().toISOString() },
    ],
    vaccines: [
      { id: 'v1', patientId: 'p1', name: 'Influenza', givenAt: '2024-10-02', batch: 'FLU-24-A' },
    ],
    documents: [
      { id: 'd1', patientId: 'p1', name: 'CDM consent', kind: 'consent', createdAt: '2022-01-15T09:00:00.000Z' },
    ],
    healthmailDirectory: [
      { id: 'hm1', name: 'Boots Thomas Street', address: 'boots.thomasst@healthmail.ie', kind: 'pharmacy' },
      { id: 'hm2', name: 'Hickeys Pharmacy', address: 'hickeys.d8@healthmail.ie', kind: 'pharmacy' },
      { id: 'hm3', name: 'Mater Cardiology', address: 'cardiology.mater@healthmail.ie', kind: 'hospital' },
    ],
  };
}

function todayAt(hours: number, minutes: number): string {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}
