//
// Síle on-device brain — Chrome's built-in Prompt API (Gemini Nano) when the
// browser has it: free, private, works offline. Progressive enhancement only:
// every caller must fall back to the server chat when this reports
// 'unavailable'/'unsupported' (Safari, Firefox, mobile, managed-Chrome
// policies, or devices below the hardware thresholds).
//
// Minimal structural types — the API is not yet in TS lib.dom.

type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

type LanguageModelLike = {
  availability?: (options?: unknown) => Promise<LanguageModelAvailability>;
  create?: (options?: unknown) => Promise<LanguageModelSessionLike>;
};

type LanguageModelSessionLike = {
  prompt: (text: string) => Promise<string>;
  destroy?: () => void;
};

function languageModel(): LanguageModelLike | null {
  const lm = (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel;
  return lm ?? null;
}

export type DeviceBrainStatus = 'unsupported' | LanguageModelAvailability;

/** One-shot check — safe on any browser. */
export async function deviceBrainStatus(): Promise<DeviceBrainStatus> {
  const lm = languageModel();
  if (!lm?.availability) return 'unsupported';
  try {
    return (await lm.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    })) as LanguageModelAvailability;
  } catch {
    try {
      return (await lm.availability()) as LanguageModelAvailability;
    } catch {
      return 'unsupported';
    }
  }
}

let cachedSession: LanguageModelSessionLike | null = null;
let cachedStatus: DeviceBrainStatus | null = null;

/** Lazily create (and cache) a Nano session. Returns null when unavailable. */
async function getSession(): Promise<LanguageModelSessionLike | null> {
  if (cachedSession) return cachedSession;
  cachedStatus ??= await deviceBrainStatus();
  const lm = languageModel();
  if (!lm?.create || cachedStatus !== 'available') return null;
  try {
    cachedSession = await lm.create({
      initialPrompts: [
        {
          role: 'system',
          content:
            'You are Síle, a voice assistant inside Cúram, an Irish GP practice management app. ' +
            'You are speaking with a GP. Answer in one or two short sentences — your replies are read aloud. ' +
            'You cannot see patient records; if asked something clinical or record-specific, say what to open or check in Cúram. ' +
            'Never give medical advice or diagnoses. If asked about emergencies, advise calling 999 or 112.',
        },
      ],
    });
    return cachedSession;
  } catch {
    return null;
  }
}

/** Ask the on-device model. Returns null when unavailable or on error. */
export async function deviceBrainPrompt(text: string): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const reply = await session.prompt(text);
    return reply?.trim() || null;
  } catch {
    // A poisoned session breaks every future prompt — drop it and report.
    cachedSession = null;
    return null;
  }
}
