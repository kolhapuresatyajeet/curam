import { useAppState } from '@/stores/appStore';

export function usePrescriptions() {
  return useAppState();
}
