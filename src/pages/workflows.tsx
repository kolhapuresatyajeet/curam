import { AppButton, Badge, SectionTitle, Tabs } from '@/components/shared/ui';
import { formatIrishDateTime } from '@/lib/utils';
import { appStore, useAppState } from '@/stores/appStore';
import { useState } from 'react';

export default function WorkflowsPage() {
  const state = useAppState();
  const [tab, setTab] = useState('Active');
  const list = state.workflows.filter((wf) => (tab === 'Active' ? wf.active : tab === 'Inactive' ? !wf.active : true));

  return (
    <div className="fade-in">
      <SectionTitle title="Workflows" description="Event → conditions → actions. Failures are logged; the chain continues." />
      <Tabs items={['Active', 'Inactive', 'Run history']} value={tab} onChange={setTab} />
      {tab !== 'Run history' && (
        <div className="surface divide-y rounded-xl">
          {list.map((wf) => (
            <div key={wf.id} className="flex items-center gap-3 px-4 py-4">
              <div className="flex-1">
                <div className="text-xs font-semibold">{wf.name}</div>
                <p className="text-[11px] text-slate-500">Trigger {wf.triggerEvent} · {wf.actions.join(' → ')}</p>
              </div>
              <Badge tone="slate">{wf.runCount} runs</Badge>
              <AppButton size="sm" onClick={() => appStore.toggleWorkflow(wf.id)}>
                {wf.active ? 'Disable' : 'Enable'}
              </AppButton>
            </div>
          ))}
        </div>
      )}
      {tab === 'Run history' && (
        <div className="surface divide-y rounded-xl">
          {state.workflowRuns.map((run) => (
            <div key={run.id} className="px-4 py-3 text-xs">
              {formatIrishDateTime(run.ranAt)} · {run.triggerData} · {run.result} · {run.actionsExecuted.join(', ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
