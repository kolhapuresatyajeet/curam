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

/** Local fallback summary when AI is unavailable — first sentences of the transcript. */
export function draftSummaryFromTranscript(transcript: string): string {
  const clean = transcript.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]/g) ?? [clean];
  return sentences.slice(0, 2).join(' ').slice(0, 300) || clean.slice(0, 300);
}

export type ScribeResult = {
  transcript: string;
  draft: { subjective: string; objective: string; assessment: string; plan: string };
  codes: string[];
  summary: string;
};

/** Decode any browser recording (webm/opus, mp4/aac…) and re-encode as mono
 *  16 kHz 16-bit WAV — the one audio format every transcription path accepts. */
async function blobToWav(blob: Blob): Promise<Blob> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const rate = 16_000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

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
    let audioBlob = input.audio;
    let name = input.audioName ?? 'consult.webm';
    if (!name.endsWith('.wav')) {
      // Browsers record webm/opus (or mp4) — convert to WAV so the gateway
      // always receives a universally accepted format.
      try {
        audioBlob = await blobToWav(input.audio);
        name = 'consult.wav';
      } catch {
        /* conversion failed — upload the original and let the server try */
      }
    }
    form.append('audio', audioBlob, name);
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
      summary: typeof body.summary === 'string' ? body.summary : '',
    },
  };
}
