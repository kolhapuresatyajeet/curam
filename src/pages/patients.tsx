import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useLocation } from 'wouter';
import { AppButton, Avatar, Badge, EmptyState, SectionTitle, inputClass } from '@/components/shared/ui';
import { fetchPatients } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { ageFromDob, formatIrishDate } from '@/lib/utils';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function PatientsPage() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'gms' | 'cdm' | 'recent'>('all');

  useEffect(() => {
    if (!supabaseConfigured) return;
    void fetchPatients().then((rows) => appStore.mergePatients(rows));
  }, []);

  const enrolled = new Set(state.cdmEnrolments.filter((item) => item.status === 'active').map((item) => item.patientId));
  const panel = supabaseConfigured ? state.patients.filter((patient) => patient.id.includes('-')) : state.patients;

  const rows = useMemo(() => {
    return panel.filter((patient) => {
      const hay = `${patientName(patient)} ${patient.gmsNumber} ${patient.ihiNumber} ${patient.phone} ${patient.ppsNumber}`.toLowerCase();
      if (search && !hay.includes(search.toLowerCase())) return false;
      if (tab === 'gms') return patient.medicalCardType === 'gms' || patient.medicalCardType === 'gp_visit';
      if (tab === 'cdm') return enrolled.has(patient.id);
      if (tab === 'recent') return true;
      return true;
    });
  }, [panel, search, tab, enrolled]);

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow={`${panel.length} on the panel`}
        title="Patients"
        description="Find a patient, open their record, and keep the next step moving."
        action={
          <AppButton size="sm" icon={UserPlus} onClick={() => setLocation('/patients/new')}>
            Register patient
          </AppButton>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['gms', 'GMS panel'],
          ['cdm', 'CDM enrolled'],
          ['recent', 'Recent'],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id as typeof tab)} className={`rounded-md px-3 py-1.5 text-[11px] ${tab === id ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-400 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
        <input className={`${inputClass} ml-auto max-w-xs`} placeholder="Search name, PPS, GMS, IHI..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-page-search" />
      </div>
      <div className="surface overflow-hidden rounded-xl">
        <div className="divide-y divide-slate-100">
          {rows.map((patient) => {
            const tags = state.conditions.filter((c) => c.patientId === patient.id && c.status === 'active').map((c) => c.conditionName);
            return (
              <button key={patient.id} type="button" data-testid={`button-patient-${patient.id}`} onClick={() => setLocation(`/patients/${patient.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <Avatar name={patientName(patient)} tone={patient.colour} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-700">{patientName(patient)}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    DOB {formatIrishDate(patient.dob)} · age {ageFromDob(patient.dob)} · {patient.medicalCardType === 'gms' ? 'GMS' : patient.insurer ?? 'Private'}
                  </span>
                </span>
                {tags.length > 0 && <Badge tone={patient.colour}>{tags.join(' · ')}</Badge>}
                <ChevronRight size={15} className="text-slate-300" />
              </button>
            );
          })}
        </div>
        {!rows.length && <EmptyState title="No patients found" detail="Try a name, condition, date of birth or identifier." />}
      </div>
    </div>
  );
}
