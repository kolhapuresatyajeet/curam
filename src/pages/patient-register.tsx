import { useState } from 'react';
import { useLocation } from 'wouter';
import { AppButton, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { insertPatient } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { appStore } from '@/stores/appStore';
import type { Gender, MedicalCardType, SmokingStatus } from '@/types/domain';

export default function PatientRegisterPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    gender: 'unknown' as Gender,
    ppsNumber: '',
    gmsNumber: '',
    ihiNumber: '',
    medicalCardType: 'none' as MedicalCardType,
    phone: '',
    email: '',
    address: '',
    eircode: '',
    pharmacyName: '',
    pharmacyHealthmail: '',
    allergies: 'NKDA',
    smokingStatus: 'unknown' as SmokingStatus,
    gdprConsent: false,
    sileConsent: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fade-in max-w-3xl">
      <SectionTitle title="Register patient" description="Irish identifiers, pharmacy, consent. All writes are audited." />
      <form
        className="surface grid gap-3 rounded-xl p-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            if (!form.gdprConsent) return;
            setError('');
            const created = appStore.registerPatient(form);
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
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08X XXX XXXX" /></Field>
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
            Save patient
          </AppButton>
        </div>
      </form>
    </div>
  );
}
