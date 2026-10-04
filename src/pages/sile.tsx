import { useState } from 'react';
import { AppButton, Badge, EmptyState, MetricCard, SectionTitle, Tabs } from '@/components/shared/ui';
import { useAppState } from '@/stores/appStore';
import { useLocation } from 'wouter';
import { patientName } from '@/types/domain';
import { FileText, MessageCircle, Sparkles } from 'lucide-react';
import { formatIrishDateTime } from '@/lib/utils';
import VoiceChat from '@/components/sile/VoiceChat';

/** Síle is Cúram's own GP-facing AI layer: briefing, drafts and (soon) chat.
 *  VoiceHub — its sister app — makes the patient phone calls; Síle surfaces
 *  VoiceHub's call insights here. Everything Síle produces needs human
 *  approval before it reaches a record. */
export default function SilePage() {
  const state = useAppState();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState('Briefing');

  const draftReferrals = state.referrals.filter((r) => r.sileDrafted && r.status === 'draft');
  const draftMessages = state.inbox.filter((m) => m.channel === 'sile_draft');
  const consented = state.patients.filter((p) => p.sileConsent).length;
  const draftCount = draftReferrals.length + draftMessages.length;
  const heldAbnormal = state.labResults.filter((r) => r.abnormalFlags.length > 0 && !r.gpReviewed).length;

  return (
    <div className="fade-in">
      <SectionTitle
        title="Síle AI"
        description="The practice's own AI assistant for the GP team — daily briefing, drafts and voice chat. VoiceHub, its sister app, handles patient phone calls; Síle surfaces those insights here. Everything needs human approval before it reaches a record."
      />
      <Tabs items={['Briefing', 'Drafts', 'Chat']} value={tab} onChange={setTab} />

      {tab === 'Briefing' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Drafts awaiting approval" value={String(draftCount)} detail="Referrals + letters" icon={FileText} tone="purple" />
            <MetricCard label="Síle-consented patients" value={`${consented}/${state.patients.length}`} detail="Consent on record" icon={Sparkles} tone="teal" />
            <MetricCard label="Abnormal labs held" value={String(heldAbnormal)} detail="GP callback only — never AI" icon={MessageCircle} tone="coral" />
            <MetricCard label="VoiceHub calls" value={String(state.sileCalls.length)} detail="Sister app — logged with transcript" icon={MessageCircle} tone="blue" />
          </div>
          <div className="surface mt-4 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-800">Today’s briefing</h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-600">
              {draftCount === 0
                ? 'Nothing is waiting for your approval — you are clear.'
                : `${draftCount} draft${draftCount === 1 ? ' is' : 's are'} waiting for GP approval.`}{' '}
              Abnormal lab results are held for your callback and are never delivered by AI. VoiceHub has logged {state.sileCalls.length} patient call{state.sileCalls.length === 1 ? '' : 's'} with transcripts. The consultation scribe turns dictation into SOAP notes for your sign-off.
            </p>
          </div>
        </>
      )}

      {tab === 'Drafts' && (
        <div className="surface divide-y rounded-xl">
          {draftReferrals.map((r) => {
            const patient = state.patients.find((p) => p.id === r.patientId);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Badge tone="purple">
                  <FileText size={11} /> Referral draft
                </Badge>
                <span className="text-xs font-semibold text-slate-700">{patient ? patientName(patient) : 'Unknown'} · {r.specialty}</span>
                <span className="text-[11px] text-slate-500">{r.hospital}</span>
                <span className="ml-auto">
                  <AppButton size="sm" variant="ghost" onClick={() => setLocation('/referrals')}>
                    Review
                  </AppButton>
                </span>
              </div>
            );
          })}
          {draftMessages.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Badge tone="purple">
                <Sparkles size={11} /> Letter draft
              </Badge>
              <span className="text-xs font-semibold text-slate-700">{m.subject}</span>
              <span className="text-[11px] text-slate-500">{formatIrishDateTime(m.receivedAt)}</span>
              <span className="ml-auto">
                <AppButton size="sm" variant="ghost" onClick={() => setLocation('/inbox')}>
                  Open inbox
                </AppButton>
              </span>
            </div>
          ))}
          {!draftCount && <EmptyState title="No drafts waiting" detail="Síle-drafted referrals and letters appear here for GP approval." />}
        </div>
      )}

      {tab === 'Chat' && <VoiceChat />}
    </div>
  );
}
