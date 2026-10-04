import { useSyncExternalStore } from 'react';

/**
 * Shared open/close state for the global Síle voice widget, so any page can
 * pop it open without prop-drilling through the app shell.
 */
let open = false;
const listeners = new Set<() => void>();

export function openVoiceWidget() {
  open = true;
  listeners.forEach((listener) => listener());
}

export function setVoiceWidgetOpen(next: boolean) {
  open = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceWidgetOpen(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => open);
  return [value, setVoiceWidgetOpen];
}
