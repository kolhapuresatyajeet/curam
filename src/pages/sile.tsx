import { useState } from 'react';
import { AppButton, Badge, Field, MetricCard, SectionTitle, Tabs, inputClass } from '@/components/shared/ui';
import { detectEmergency, emergencyScript, sileVoiceTools } from '@/lib/sile';
import { getSupabaseConfig } from '@/lib/supabase';
import { formatIrishDateTime } from '@/lib/utils';
import { Phone, Sparkles } from 'lucide-react';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';

export default function SilePage() {
  const state = useAppState();
  const [tab, setTab] = useState('Dashboard');
  const [transcript, setTranscript] = useState('');
  const [purpose, setPurpose] = useState<'booking' | 'results' | 'cdm_recall' | 'payment' | 'other'>('booking');

  return (
    <div className="fade-in">
      <SectionTitle title="Síle AI" description="Voice agent books the same appointment table as reception. Emergency language forces 999/112. Abnormal results are blocked from outbound delivery." />
      <Tabs items={['Dashboard', 'Call log', 'Voice API', 'Simulate']} value={tab} onChange={setTab} />
      {tab === 'Dashboard' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Calls logged" value={String(state.sileCalls.length)} detail="Inbound + outbound" icon={Phone} tone="teal" />
          <MetricCard label="Bookings" value={String(state.sileCalls.filter((c) => c.purpose === 'booking').length)} detail="Purpose" icon={Sparkles} tone="purple" />
          <MetricCard label="Results delivered" value={String(state.sileCalls.filter((c) => c.purpose === 'results').length)} detail="Normal only" icon={Sparkles} tone="blue" />
          <MetricCard label="Avg duration" value={`${Math.round(state.sileCalls.reduce((s, c) => s + c.durationSeconds, 0) / Math.max(state.sileCalls.length, 1))}s`} detail="Seconds" icon={Phone} tone="amber" />
        </div>
      )}
      {tab === 'Call log' && (
        <div className="surface divide-y rounded-xl">
          {state.sileCalls.map((call) => {
            const patient = state.patients.find((p) => p.id === call.patientId);
            return (
              <div key={call.id} className="px-4 py-3">
                <div className="flex gap-2">
                  <span className="text-xs font-semibold">{patient ? patientName(patient) : 'Unknown'} · {call.purpose}</span>
                  <Badge tone={call.direction === 'inbound' ? 'blue' : 'teal'}>{call.direction}</Badge>
                </div>
                <p className="text-[11px] text-slate-500">{call.outcome}</p>
                <p className="text-[10px] text-slate-400">{formatIrishDateTime(call.createdAt)} · {call.durationSeconds}s</p>
                <p className="mt-1 text-[11px] italic text-slate-500">“{call.transcript}”</p>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'Voice API' && (
        <div className="surface max-w-2xl space-y-3 rounded-xl p-4 text-sm text-slate-700">
          <p>The receptionist project posts here with <code className="rounded bg-slate-100 px-1">x-booking-key</code> (Edge secret <code className="rounded bg-slate-100 px-1">BOOKING_API_KEY</code>). Book and cancel write the Ireland diary and the clinician’s <span className="font-medium">Cúram — name</span> Google Calendar. Never put the service role in the voice platform.</p>
          <ul className="list-disc space-y-2 pl-5 text-[13px]">
            {sileVoiceTools(getSupabaseConfig().url || 'https://YOUR_PROJECT.supabase.co').map((tool) => (
              <li key={tool.name}>
                <span className="font-semibold">{tool.method} {tool.name}</span>
                <div className="break-all font-mono text-[11px] text-teal-800">{tool.url}</div>
                <p className="text-slate-500">{tool.description}</p>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-slate-500">The voice project identifies the caller by mobile number (E.164 or 08X). Booking needs Síle consent; cancel does not. Shared household numbers must go to reception.</p>
        </div>
      )}
      {tab === 'Simulate' && (
        <div className="surface max-w-lg space-y-3 rounded-xl p-4">
          <Field label="Purpose">
            <select className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
              <option value="booking">Booking</option>
              <option value="results">Results</option>
              <option value="cdm_recall">CDM recall</option>
              <option value="payment">Payment</option>
            </select>
          </Field>
          <Field label="Transcript">
            <textarea className={`${inputClass} h-24 py-2`} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </Field>
          {detectEmergency(transcript) && <p className="text-sm text-red-700">{emergencyScript()}</p>}
          <AppButton
            size="sm"
            variant="primary"
            onClick={() => {
              appStore.logSileCall({
                patientId: state.patients[0]?.id,
                direction: 'inbound',
                purpose,
                transcript,
                outcome: detectEmergency(transcript) ? 'Escalated' : 'Logged',
                durationSeconds: 90,
              });
              setTranscript('');
              setTab('Call log');
            }}
          >
            Log call
          </AppButton>
        </div>
      )}
    </div>
  );
}
