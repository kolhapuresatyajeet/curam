import { supabase, supabaseConfigured } from '@/lib/supabase';

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

export type ScribeResult = {
  transcript: string;
  draft: { subjective: string; objective: string; assessment: string; plan: string };
  codes: string[];
};

/** Calls the ai-scribe Edge Function with a recording and/or transcript. Returns null on failure. */
export async function structureSoapRemote(input: {
  patientId: string;
  transcript?: string;
  audio?: Blob | null;
  audioName?: string;
}): Promise<{ ok: true; result: ScribeResult } | { ok: false; error: string }> {
  if (!supabaseConfigured || !supabase) return { ok: false, error: 'Supabase is not configured' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Sign in first' };

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  let response: Response;
  if (input.audio) {
    const form = new FormData();
    form.append('audio', input.audio, input.audioName ?? 'consult.webm');
    form.append('patientId', input.patientId);
    if (input.transcript) form.append('transcript', input.transcript);
    response = await fetch(`${url}/functions/v1/ai-scribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } else {
    response = await fetch(`${url}/functions/v1/ai-scribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: input.patientId, transcript: input.transcript ?? '' }),
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.draft) return { ok: false, error: body.error ?? `Scribe failed (HTTP ${response.status})` };
  return {
    ok: true,
    result: {
      transcript: body.transcript ?? input.transcript ?? '',
      draft: body.draft,
      codes: Array.isArray(body.codes) ? body.codes.map(String) : [],
    },
  };
}
