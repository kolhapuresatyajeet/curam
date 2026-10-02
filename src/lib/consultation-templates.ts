import type { ConsultationTemplate } from '@/types/domain';

// Note-type presets for consultation notes. Selecting one does NOT attach
// data to the note — it only tunes the guidance hint and the example
// placeholders shown in the SOAP fields for that kind of consultation.
export type ConsultationTemplateDef = {
  id: ConsultationTemplate;
  label: string;
  hint: string;
  placeholders: Record<'subjective' | 'objective' | 'assessment' | 'plan', string>;
};

export const CONSULTATION_TEMPLATES: ConsultationTemplateDef[] = [
  {
    id: 'gp_consult',
    label: 'GP consult',
    hint: 'Standard face-to-face GP consultation in surgery.',
    placeholders: { subjective: 'Presenting complaint, history…', objective: 'Examination findings, vitals…', assessment: 'Diagnosis / differential…', plan: 'Management, prescriptions, follow-up…' },
  },
  {
    id: 'phone_triage',
    label: 'Phone triage',
    hint: 'Telephone triage — no examination possible. Record advice and safety-netting.',
    placeholders: { subjective: 'History taken over the phone…', objective: 'No examination (remote consult).', assessment: 'Triage impression / category…', plan: 'Advice given, safety-netting, when to call back or attend…' },
  },
  {
    id: 'nurse_clinic',
    label: 'Nurse clinic',
    hint: 'Nurse-led clinic — observations, injections, wound care.',
    placeholders: { subjective: 'Reason for nurse appointment…', objective: 'Observations (BP, HR, SpO2), wound state…', assessment: 'Nurse assessment…', plan: 'Treatment given, next nurse appointment…' },
  },
  {
    id: 'home_visit',
    label: 'Home visit',
    hint: 'Out-of-surgery visit — note home conditions and community follow-up.',
    placeholders: { subjective: 'History at home visit…', objective: 'Findings in the home environment…', assessment: 'Assessment…', plan: 'Arrangements, community follow-up…' },
  },
];

export function templateLabel(templateType: ConsultationTemplate): string {
  return CONSULTATION_TEMPLATES.find((item) => item.id === templateType)?.label ?? templateType;
}
