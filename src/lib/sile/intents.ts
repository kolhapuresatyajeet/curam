//
// Síle Phase-1 intent brain — runs fully on-device, zero server calls.
//
// Matches spoken/typed commands against the local practice state and returns
// a spoken reply plus an optional navigation target. Phase 2 replaces this
// with LLM tool-calling via a `sile-command` Edge Function for Supabase-
// backed questions; these local intents remain as the offline fallback.

import type { PracticeState } from '@/types/domain';
import { patientName } from '@/types/domain';

export type SileCommandResult = {
  reply: string;
  navigate?: string;
  matched: boolean;
};

const NAV_TARGETS: { patterns: RegExp; path: string; label: string }[] = [
  { patterns: /\b(patients?|patient list)\b/, path: '/patients', label: 'the patient list' },
  { patterns: /\b(calendar|schedule|appointments?|bookings?)\b/, path: '/calendar', label: 'the calendar' },
  { patterns: /\b(waiting room|waiting)\b/, path: '/waiting-room', label: 'the waiting room' },
  { patterns: /\b(inbox|messages?|healthmail)\b/, path: '/inbox', label: 'the inbox' },
  { patterns: /\b(referrals?)\b/, path: '/referrals', label: 'the referrals list' },
  { patterns: /\b(prescriptions?|rx|repeat requests?)\b/, path: '/prescriptions', label: 'prescriptions' },
  { patterns: /\b(billing|invoices?|payments?|fees)\b/, path: '/billing', label: 'billing' },
  { patterns: /\b(cdm|chronic disease)\b/, path: '/cdm', label: 'the CDM programme' },
  { patterns: /\b(insights?|reports?|statistics)\b/, path: '/insights', label: 'insights' },
  { patterns: /\b(healthlink)\b/, path: '/healthlink', label: 'HealthLink messages' },
  { patterns: /\b(staff|team|colleagues)\b/, path: '/staff', label: 'the staff list' },
  { patterns: /\b(workflows?|automations?)\b/, path: '/workflows', label: 'workflows' },
  { patterns: /\b(settings?|preferences?)\b/, path: '/settings', label: 'settings' },
  { patterns: /\b(dashboard|home|today|my day view)\b/, path: '/', label: 'the dashboard' },
];

/** Numeric word map so "brief me on my 3pm" style phrases survive STT quirks. */
function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()} `;
}

/** Fuzzy-match a spoken name against the patient list. Returns best patient or undefined. */
function findPatient(text: string, state: PracticeState) {
  const cleaned = text
    .toLowerCase()
    .replace(/\b(open|show|go to|goto|look up|pull up|check|find|display|bring up|the|for|of|about|patient|record|notes?|chart|file|labs?|bloods?|results?|blood report|report|history|last visit|last consultation|consultation)\b/g, ' ')
    .replace(/['’]/g, ' ')
    .replace(/\b(my|me|on|s|in|to|a|an)\b/g, ' ')
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  const tokens = cleaned.split(' ').filter((t) => t.length > 1);
  if (!tokens.length) return undefined;

  let best: { patient: PracticeState['patients'][number]; score: number } | undefined;
  for (const patient of state.patients) {
    const first = patient.firstName.toLowerCase().replace(/['’]/g, '');
    const last = patient.lastName.toLowerCase().replace(/['’]/g, '');
    let score = 0;
    for (const token of tokens) {
      if (token === first || token === last) score += 2;
      else if (first.startsWith(token) || last.startsWith(token)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { patient, score };
  }
  // Require at least one exact name-token hit to avoid wild mis-fires.
  return best && best.score >= 2 ? best.patient : undefined;
}

function buildBriefing(state: PracticeState): string {
  const waiting = state.waitingRoom.filter((w) => !w.calledInAt && !w.completedAt).length;
  const unread = state.inbox.filter((m) => !m.read).length;
  const draftReferrals = state.referrals.filter((r) => r.sileDrafted && r.status === 'draft').length;
  const abnormal = state.labResults.filter((r) => r.abnormalFlags.length > 0 && !r.gpReviewed).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = state.appointments.filter((a) => a.startTime.slice(0, 10) === today);
  const upcoming = todayAppointments.filter((a) => new Date(a.startTime).getTime() > Date.now()).length;
  const cdmDue = state.cdmReviews.filter((r) => !r.gpSigned).length;

  const parts: string[] = [];
  parts.push(`You have ${upcoming} appointment${upcoming === 1 ? '' : 's'} remaining today.`);
  parts.push(waiting ? `${waiting} patient${waiting === 1 ? ' is' : 's are'} waiting.` : 'The waiting room is empty.');
  parts.push(unread ? `${unread} unread message${unread === 1 ? '' : 's'}.` : 'Inbox is clear.');
  if (draftReferrals) parts.push(`${draftReferrals} referral draft${draftReferrals === 1 ? '' : 's'} awaiting your approval.`);
  if (cdmDue) parts.push(`${cdmDue} CDM review${cdmDue === 1 ? '' : 's'} awaiting GP sign-off.`);
  if (abnormal) {
    parts.push(`${abnormal} abnormal result${abnormal === 1 ? '' : 's'} held for your callback — Síle will not deliver those.`);
  } else {
    parts.push('No abnormal results waiting.');
  }
  return parts.join(' ');
}

function waitingRoomReply(state: PracticeState): string {
  const active = state.waitingRoom.filter((w) => !w.calledInAt && !w.completedAt);
  if (!active.length) return 'Nobody is waiting right now.';
  const names = active
    .map((entry) => {
      const appointment = state.appointments.find((a) => a.id === entry.appointmentId);
      const patient = appointment && state.patients.find((p) => p.id === appointment.patientId);
      const waited = Math.round((Date.now() - new Date(entry.arrivedAt).getTime()) / 60000);
      return patient ? `${patientName(patient)} (${waited} min)` : undefined;
    })
    .filter(Boolean);
  return `${active.length} patient${active.length === 1 ? '' : 's'} waiting: ${names.join(', ')}.`;
}

function labsArrivedReply(patient: PracticeState['patients'][number], state: PracticeState): string {
  const labs = state.labResults
    .filter((r) => r.patientId === patient.id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  if (!labs.length) return `No lab results on file for ${patientName(patient)}.`;
  const unreviewed = labs.filter((r) => !r.gpReviewed);
  if (!unreviewed.length) return `All results for ${patientName(patient)} have been reviewed.`;
  const abnormal = unreviewed.filter((r) => r.abnormalFlags.length > 0);
  const normal = unreviewed.length - abnormal.length;
  const bits: string[] = [];
  if (abnormal.length) {
    bits.push(
      `${abnormal.length} abnormal result${abnormal.length === 1 ? '' : 's'} held for your review — flagged ${abnormal
        .flatMap((r) => r.abnormalFlags)
        .slice(0, 3)
        .join(', ')}.`,
    );
  }
  if (normal) bits.push(`${normal} normal result${normal === 1 ? '' : 's'} awaiting review.`);
  bits.push(`Opening ${patientName(patient)}'s record now.`);
  return bits.join(' ');
}

function lastVisitReply(patient: PracticeState['patients'][number], state: PracticeState): string {
  const last = state.consultations
    .filter((c) => c.patientId === patient.id && (c.plan || c.assessment))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return `I have no previous consultations on file for ${patientName(patient)}.`;
  const when = last.createdAt.slice(0, 10);
  const assessment = last.assessment && last.assessment !== 'AI-suggested assessment pending GP review.' ? last.assessment : '';
  const plan = last.plan ? last.plan.replace(/Safety-netting and follow-up.*$/i, '').trim() : '';
  const body = [assessment, plan].filter(Boolean).join(' — Plan: ') || 'the note has no assessment or plan recorded yet.';
  return `At ${patientName(patient)}'s last visit on ${when}: ${body}`;
}

/**
 * Execute a spoken or typed Síle command against local state.
 * Returns the spoken reply and an optional route to navigate to.
 */
export function executeSileCommand(rawText: string, state: PracticeState): SileCommandResult {
  const text = normalise(rawText);

  // Briefing — the daily workhorse.
  if (/\b(read (my|me my) day|brief me|briefing|my day|good (morning|afternoon|evening) sile)\b/.test(text)) {
    return { reply: buildBriefing(state), matched: true };
  }

  // Waiting room status.
  if (/\b(who'?s waiting|who is waiting|waiting room status|anyone waiting|whos waiting)\b/.test(text)) {
    return { reply: waitingRoomReply(state), matched: true };
  }

  // Last visit / decisions for a patient.
  if (/\b(last (visit|time|consultation)|what did (we|i) (decide|say|do))\b/.test(text)) {
    const patient = findPatient(rawText, state);
    if (patient) return { reply: lastVisitReply(patient, state), navigate: `/patients/${patient.id}`, matched: true };
    return { reply: 'Which patient should I look up? Say the patient name after the command.', matched: true };
  }

  // Has a report/result arrived?
  if (/\b(report|result|bloods?|labs?)\b/.test(text) && /\b(arriv|come back|back yet|received|checked)/.test(text)) {
    const patient = findPatient(rawText, state);
    if (patient) return { reply: labsArrivedReply(patient, state), navigate: `/patients/${patient.id}`, matched: true };
    return { reply: 'Which patient are we checking results for?', matched: true };
  }

  // Patient-centric navigation (name present) beats generic navigation.
  const mentionsName = /\b(open|show|go to|look up|pull up|check|find)\b/.test(text) && !/^\s*$/.test(text);
  if (mentionsName) {
    const patient = findPatient(rawText, state);
    if (patient) {
      return {
        reply: `Opening ${patientName(patient)}'s record.`,
        navigate: `/patients/${patient.id}`,
        matched: true,
      };
    }
  }

  // Generic page navigation.
  for (const target of NAV_TARGETS) {
    if (target.patterns.test(text) && /\b(open|show|go to|goto|take me|bring up|display|switch to|jump to|view)\b/.test(text)) {
      return { reply: `Opening ${target.label}.`, navigate: target.path, matched: true };
    }
  }

  // Short utterances that are just a destination ("patients", "inbox").
  for (const target of NAV_TARGETS) {
    if (new RegExp(`^\\s*${target.patterns.source.slice(2, -2)}\\s*$`).test(text)) {
      return { reply: `Opening ${target.label}.`, navigate: target.path, matched: true };
    }
  }

  return {
    reply: "I didn't catch a command I know yet. Try: read me my day, who's waiting, or open a patient by name.",
    matched: false,
  };
}
