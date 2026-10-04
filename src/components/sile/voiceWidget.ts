import { useSyncExternalStore } from 'react';

/**
 * Shared state for the global Síle voice widget, so any page can pop it open
 * without prop-drilling through the app shell. `listenPulse` increments each
 * time the widget is opened with auto-listen — VoiceChat watches it and starts
 * the mic straight away (one less tap for the GP).
 */
export type VoiceWidgetState = { open: boolean; listenPulse: number };

let widgetState: VoiceWidgetState = { open: false, listenPulse: 0 };
const listeners = new Set<() => void>();

export function openVoiceWidget(autoListen = true) {
  widgetState = { open: true, listenPulse: widgetState.listenPulse + (autoListen ? 1 : 0) };
  listeners.forEach((listener) => listener());
}

export function setVoiceWidgetOpen(next: boolean) {
  widgetState = { ...widgetState, open: next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceWidgetState(): VoiceWidgetState {
  return useSyncExternalStore(subscribe, () => widgetState);
}
