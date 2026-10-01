import { useEffect, useState } from 'react';
import { AppButton, Badge, SectionTitle } from '@/components/shared/ui';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { formatIrishDateTime } from '@/lib/utils';
import { appStore, useAppState } from '@/stores/appStore';
import { patientName } from '@/types/domain';
import type { WorkflowRun } from '@/types/domain';

type Definition = {
  id: string;
  name: string;
  triggerEvent: string;
  actions: string[];
  active: boolean;
  runCount: number;
};

type Run = {
  id: string;
  workflowId: string;
  patientId: string | null;
  result: string;
  ranAt: string;
  actions: { action: string; ok: boolean; error?: string }[];
};

export default function WorkflowsPage() {
  const state = useAppState();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured || !supabase || loaded) return;
    setLoaded(true);
    void (async () => {
      const { data: defs, error: defsError } = await supabase!
        .from('workflow_definitions')
        .select('id, name, trigger_event, actions_json, active, run_count')
        .order('name');
      if (defsError) setError(defsError.message);
      setDefinitions(
        (defs ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          triggerEvent: d.trigger_event ?? '',
          actions: Array.isArray(d.actions_json) ? d.actions_json.map((a: any) => a.type) : [],
          active: d.active === true,
          runCount: d.run_count ?? 0,
        })),
      );

      const { data: runRows } = await supabase!
        .from('workflow_runs')
        .select('id, workflow_id, patient_id, result, ran_at, actions_executed')
        .order('ran_at', { ascending: false })
        .limit(50);
      setRuns(
        (runRows ?? []).map((r: any) => ({
          id: r.id,
          workflowId: r.workflow_id,
          patientId: r.patient_id,
          result: r.result ?? 'ok',
          ranAt: r.ran_at ?? '',
          actions: Array.isArray(r.actions_executed) ? r.actions_executed : [],
        })),
      );
    })();
  }, [loaded]);

  async function toggle(definition: Definition) {
    const next = !definition.active;
    setDefinitions((current) => current.map((d) => (d.id === definition.id ? { ...d, active: next } : d)));
    const { error: updateError } = await supabase!
      .from('workflow_definitions')
      .update({ active: next })
      .eq('id', definition.id);
    if (updateError) {
      setError(updateError.message);
      setDefinitions((current) => current.map((d) => (d.id === definition.id ? { ...d, active: !next } : d)));
    }
    appStore.toggleWorkflow(definition.id);
  }

  return (
    <div className="fade-in">
      <SectionTitle title="Workflows" description="Automations: events trigger action chains. Runs are logged with results — a failing action never halts the chain." />
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      <div className="surface divide-y rounded-xl">
        {definitions.map((definition) => (
          <div key={definition.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">{definition.name}</div>
              <div className="text-[11px] text-slate-500">
                On <span className="font-mono">{definition.triggerEvent}</span> → {definition.actions.join(' → ')}
              </div>
            </div>
            <span className="text-[11px] text-slate-400">{definition.runCount} runs</span>
            <AppButton size="sm" variant={definition.active ? 'primary' : 'ghost'} onClick={() => void toggle(definition)}>
              {definition.active ? 'Enabled' : 'Disabled'}
            </AppButton>
          </div>
        ))}
        {!definitions.length && !loaded && !supabaseConfigured && (
          <div className="px-4 py-3 text-xs text-slate-400">Connect Supabase to load automations from the database.</div>
        )}
        {!definitions.length && !loaded && supabaseConfigured && <div className="px-4 py-3 text-xs text-slate-400">Loading workflows…</div>}
        {!definitions.length && loaded && <div className="px-4 py-3 text-xs text-slate-400">No workflows configured.</div>}
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Run history</h3>
      <div className="surface max-h-[420px] divide-y overflow-auto rounded-xl">
        {runs.map((run) => {
          const name = definitions.find((d) => d.id === run.workflowId)?.name ?? run.workflowId;
          const patient = state.patients.find((p) => p.id === run.patientId);
          return (
            <div key={run.id} className="px-4 py-3 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-400">{formatIrishDateTime(run.ranAt)}</span>
                <span className="font-semibold">{name}</span>
                {patient && <span className="text-slate-500">· {patientName(patient)}</span>}
                <Badge tone={run.result === 'ok' ? 'teal' : 'amber'}>{run.result}</Badge>
              </div>
              {run.actions.map((action, index) => (
                <div key={index} className="mt-1 text-slate-500">
                  {action.ok ? '✓' : '✗'} {action.action}{action.error ? ` — ${action.error}` : ''}
                </div>
              ))}
            </div>
          );
        })}
        {!runs.length && <div className="px-4 py-3 text-xs text-slate-400">No runs yet.</div>}
      </div>
    </div>
  );
}
