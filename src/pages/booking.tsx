import { useState } from 'react';
import { AppButton, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { detectEmergency, emergencyScript } from '@/lib/sile';
import { getSupabaseConfig, supabaseConfigured } from '@/lib/supabase';

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [reason, setReason] = useState('');
  const [time, setTime] = useState('15:20');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const emergency = detectEmergency(reason);

  return (
    <div className="mx-auto max-w-lg p-6">
      <SectionTitle eyebrow="Online booking" title="Book an appointment" description="Triage first. Chest pain or breathing difficulty is never booked — call 999/112. Síle uses the same API." />
      {emergency && <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{emergencyScript()}</div>}
      {done && <div className="surface rounded-xl p-4 text-sm text-teal-800">{done}</div>}
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      {!done && !emergency && (
        <div className="surface space-y-3 rounded-xl p-5">
          {step === 1 && (
            <>
              <Field label="First name"><input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
              <Field label="Surname"><input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
              <Field label="Date of birth"><input className={inputClass} type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
              <Field label="Reason for visit"><textarea className={`${inputClass} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <AppButton size="sm" variant="primary" onClick={() => setStep(2)}>
                Continue
              </AppButton>
            </>
          )}
          {step === 2 && (
            <>
              <Field label="Slot">
                <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <AppButton
                size="sm"
                variant="primary"
                onClick={() => {
                  void (async () => {
                    const [h, m] = time.split(':').map(Number);
                    const start = new Date();
                    start.setHours(h, m, 0, 0);
                    if (!supabaseConfigured) {
                      setError('Online booking needs the Ireland API.');
                      return;
                    }
                    const { url, anonKey } = getSupabaseConfig();
                    const response = await fetch(`${url}/functions/v1/book-appointment`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        apikey: anonKey,
                        Authorization: `Bearer ${anonKey}`,
                      },
                      body: JSON.stringify({
                        patientFirstName: firstName,
                        patientLastName: lastName,
                        dob,
                        startTime: start.toISOString(),
                        bookedVia: 'online',
                        triageNotes: reason,
                      }),
                    });
                    const payload = (await response.json()) as { error?: string; emergency?: string; appointmentId?: string };
                    if (payload.emergency) {
                      setError(payload.emergency);
                      return;
                    }
                    if (!response.ok) {
                      setError(payload.error ?? 'Could not book');
                      return;
                    }
                    setDone(`Booked ${time}. Confirmation will follow by SMS when Twilio is connected.`);
                  })();
                }}
              >
                Book
              </AppButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}
