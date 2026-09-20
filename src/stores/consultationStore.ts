import { useSyncExternalStore } from 'react';
import type { Consultation } from '@/types/domain';

interface ConsultationUi {
  active?: Consultation;
  recording: boolean;
  consent: boolean;
}

let ui: ConsultationUi = { recording: false, consent: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const consultationStore = {
  get: () => ui,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setActive(active?: Consultation) {
    ui = { ...ui, active };
    emit();
  },
  setRecording(recording: boolean) {
    ui = { ...ui, recording };
    emit();
  },
  setConsent(consent: boolean) {
    ui = { ...ui, consent };
    emit();
  },
};

export function useConsultationStore() {
  return useSyncExternalStore(consultationStore.subscribe, consultationStore.get, consultationStore.get);
}
