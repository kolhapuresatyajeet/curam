const ICPC: { code: string; label: string; keywords: string[] }[] = [
  { code: 'T90', label: 'Diabetes non-insulin dependent', keywords: ['diabetes', 'hba1c', 'glucose', 'dm2'] },
  { code: 'K86', label: 'Hypertension uncomplicated', keywords: ['hypertension', 'bp', 'blood pressure', 'htn'] },
  { code: 'R96', label: 'Asthma', keywords: ['asthma', 'wheeze', 'inhaler', 'peak flow'] },
  { code: 'R95', label: 'COPD', keywords: ['copd', 'spirometry', 'dyspnoea'] },
  { code: 'K74', label: 'Ischaemic heart disease', keywords: ['ihd', 'angina', 'chest', 'warfarin', 'inr'] },
  { code: 'K77', label: 'Heart failure', keywords: ['heart failure', 'furosemide', 'oedema'] },
  { code: 'K78', label: 'Atrial fibrillation', keywords: ['af', 'atrial', 'fibrillation'] },
  { code: 'R74', label: 'Upper respiratory infection', keywords: ['cough', 'cold', 'uri', 'sore throat'] },
];

export function suggestIcpc2(text: string): string[] {
  const hay = text.toLowerCase();
  return ICPC.filter((item) => item.keywords.some((word) => hay.includes(word))).map(
    (item) => `${item.code} ${item.label}`,
  );
}

export function draftSoapFromTranscript(transcript: string, context: string) {
  return {
    subjective: `Patient reports: ${transcript.slice(0, 280)}${transcript.length > 280 ? '…' : ''}`,
    objective: context || 'Examination findings to be confirmed by GP.',
    assessment: 'AI-suggested assessment pending GP review.',
    plan: 'Safety-netting and follow-up to be confirmed. AI content must be approved before signing.',
  };
}
