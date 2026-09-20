import { useMemo } from 'react';
import { useAppState } from '@/stores/appStore';

export function useAppointments(dayIso?: string) {
  const state = useAppState();
  return useMemo(() => {
    const list = [...state.appointments].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!dayIso) return list;
    const day = dayIso.slice(0, 10);
    return list.filter((item) => item.startTime.slice(0, 10) === day);
  }, [state.appointments, dayIso]);
}
