import { useMemo } from 'react';
import { patientName } from '@/types/domain';
import { useAppState } from '@/stores/appStore';

export function usePatients(query = '') {
  const state = useAppState();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.patients.filter((patient) => {
      if (!q) return true;
      return `${patientName(patient)} ${patient.gmsNumber} ${patient.ppsNumber} ${patient.ihiNumber} ${patient.phone}`.toLowerCase().includes(q);
    });
  }, [state.patients, query]);
}

export function usePatient(id?: string) {
  const state = useAppState();
  return state.patients.find((item) => item.id === id);
}
