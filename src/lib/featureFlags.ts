import { useSyncExternalStore } from 'react';

/**
 * Client-side feature flags, persisted per device in localStorage.
 * The hard gate for Síle chat is server-side (SILE_CHAT_ENABLED secret on the
 * `sile-chat` function) — this flag only controls whether the UI is offered.
 */
export type FeatureFlag = 'sileChat' | 'silePremiumVoice';

const STORAGE_KEY = 'curam.featureFlags';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  sileChat: true, // enabled by default; disable in Settings or here if AI spend is a concern
  // Phase 3 TESTING ONLY for now: ElevenLabs premium TTS via the sile-tts edge
  // function (API key stays server-side). Enabled for evaluation — before
  // production rollout this must go back to false pending an EU data-residency
  // review (reply text may contain patient identifiers; api.elevenlabs.io is
  // US-hosted unless an EU residency endpoint is configured).
  silePremiumVoice: true,
};

type Flags = Record<FeatureFlag, boolean>;

function load(): Flags {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let flags: Flags = load();
const listeners = new Set<() => void>();

export function getFlag(key: FeatureFlag): boolean {
  return flags[key];
}

export function setFlag(key: FeatureFlag, value: boolean): void {
  flags = { ...flags, [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeatureFlag(key: FeatureFlag): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => flags[key],
    () => DEFAULTS[key],
  );
  return [value, (next: boolean) => setFlag(key, next)];
}
