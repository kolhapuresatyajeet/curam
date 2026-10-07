import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { AppButton, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { insertPatient } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName, type Gender, type HouseholdRelationship, type MedicalCardType, type SmokingStatus } from '@/types/domain';

export default function PatientRegisterPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const state = useAppState();
  const [error, setError] = useState('');

  const householdId = useMemo(() => new URLSearchParams(search).get('household') ?? '', [search]);
  const primary = state.patients.find((p) => p.id === householdId || (p.householdId === householdId && p.isPrimary));

  const [form, setForm] = useState({
    firstName: '',
    lastName: primary?.lastName ?? '',
    dob: '',
    gender: 'unknown' as Gender,
    ppsNumber: '',
    gmsNumber: '',
    ihiNumber: '',
    medicalCardType: (primary?.medicalCardType ?? 'none') as MedicalCardType,
    phone: primary?.phone ?? '',
    email: '',
    address: primary?.address ?? '',
    eircode: primary?.eircode ?? '',
    pharmacyName: primary?.pharmacyName ?? '',
    pharmacyHealthmail: primary?.pharmacyHealthmail ?? '',
    allergies: 'NKDA',
    smokingStatus: 'unknown' as SmokingStatus,
    gdprConsent: false,
    sileConsent: primary?.sileConsent ?? false,
    relationship: 'child' as HouseholdRelationship,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const addingFamily = Boolean(primary);
  const childUsesGuardianPhone = addingFamily && form.relationship === 'child';

  return (
    <div className="fade-in max-w-3xl">
      <SectionTitle
        title={addingFamily ? `Add family member · ${patientName(primary!)}` : 'Register patient'}
        description={
          addingFamily
            ? 'Adults keep their own mobile. Children without a phone are reachable on the main member’s number when that person calls the practice.'
            : 'Irish identifiers, pharmacy, consent. All writes are audited.'
        }
      />
      <form
        className="surface grid gap-3 rounded-xl p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            if (!form.gdprConsent) return;
            setError('');
            const created = appStore.registerPatient({
              ...form,
              phone: childUsesGuardianPhone ? (form.phone || primary?.phone || '') : form.phone,
              householdId: primary?.householdId ?? primary?.id ?? '',
              isPrimary: !addingFamily,
              relationship: addingFamily ? form.relationship : 'self',
            });
            if (supabaseConfigured) {
              const { error: saveError } = await insertPatient(created);
              if (saveError) {
                setError(saveError.message);
                return;
              }
            }
            setLocation(`/patients/${created.id}`);
          })();
        }}
      >
        {addingFamily && (
          <Field label="Relationship to main member">
            <select
              className={inputClass}
              value={form.relationship}
              onChange={(e) => {
                const relationship = e.target.value as HouseholdRelationship;
                set('relationship', relationship);
                if (relationship === 'child' && !form.phone) set('phone', primary?.phone ?? '');
                if (relationship !== 'child' && form.phone === (primary?.phone ?? '')) set('phone', '');
              }}
            >
              <option value="child">Child (no own phone)</option>
              <option value="spouse">Spouse / partner</option>
              <option value="parent">Parent</option>
              <option value="other">Other family</option>
            </select>
          </Field>
        )}
        <Field label="First name"><input className={inputClass} required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
        <Field label="Surname"><input className={inputClass} required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
        <Field label="Date of birth"><input className={inputClass} type="date" required value={form.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="Gender">
          <select className={inputClass} value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="PPS number"><input className={inputClass} value={form.ppsNumber} onChange={(e) => set('ppsNumber', e.target.value)} /></Field>
        <Field label="GMS number"><input className={inputClass} value={form.gmsNumber} onChange={(e) => set('gmsNumber', e.target.value)} /></Field>
        <Field label="IHI (18 digits)"><input className={inputClass} value={form.ihiNumber} onChange={(e) => set('ihiNumber', e.target.value)} /></Field>
        <Field label="Medical card">
          <select className={inputClass} value={form.medicalCardType} onChange={(e) => set('medicalCardType', e.target.value as MedicalCardType)}>
            <option value="none">None / private</option>
            <option value="gms">GMS</option>
            <option value="gp_visit">GP visit card</option>
          </select>
        </Field>
        <Field label={childUsesGuardianPhone ? 'Contact phone (guardian)' : 'Phone'}>
          <input
            className={inputClass}
            value={childUsesGuardianPhone ? (form.phone || primary?.phone || '') : form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder={childUsesGuardianPhone ? 'Uses the main member’s mobile unless you enter another' : '08X XXX XXXX'}
          />
        </Field>
        <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address"><input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Eircode"><input className={inputClass} value={form.eircode} onChange={(e) => set('eircode', e.target.value)} /></Field>
        <Field label="Pharmacy"><input className={inputClass} value={form.pharmacyName} onChange={(e) => set('pharmacyName', e.target.value)} /></Field>
        <Field label="Pharmacy Healthmail"><input className={inputClass} value={form.pharmacyHealthmail} onChange={(e) => set('pharmacyHealthmail', e.target.value)} /></Field>
        <Field label="Allergies"><input className={inputClass} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} /></Field>
        <Field label="Smoking">
          <select className={inputClass} value={form.smokingStatus} onChange={(e) => set('smokingStatus', e.target.value as SmokingStatus)}>
            <option value="never">Never</option>
            <option value="ex">Ex-smoker</option>
            <option value="current">Current</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <label className="col-span-full flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={form.gdprConsent} onChange={(e) => set('gdprConsent', e.target.checked)} required />
          GDPR consent recorded
        </label>
        <label className="col-span-full flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={form.sileConsent} onChange={(e) => set('sileConsent', e.target.checked)} />
          Síle AI voice consent (required for the voice receptionist to book)
        </label>
        {error && <p className="col-span-full text-xs text-red-600">{error}</p>}
        <div className="col-span-full">
          <AppButton type="submit" variant="primary">
            {addingFamily ? 'Save family member' : 'Save patient'}
          </AppButton>
        </div>
      </form>
    </div>
  );
}
