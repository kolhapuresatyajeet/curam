import { ChartNoAxesCombined } from 'lucide-react';
import { MetricCard, SectionTitle } from '@/components/shared/ui';
import { formatEur } from '@/lib/utils';
import { useAppState } from '@/stores/appStore';

export default function InsightsPage() {
  const state = useAppState();
  const revenue = state.invoices.reduce((s, i) => s + i.paidAmount, 0);
  const dna = state.appointments.filter((a) => a.status === 'dna').length;

  return (
    <div className="fade-in">
      <SectionTitle title="Insights" description="Access, quality and money — from live workspace data, not a static mock." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Panel size" value={String(state.patients.length)} detail="Registered patients" icon={ChartNoAxesCombined} tone="teal" />
        <MetricCard label="Appointments" value={String(state.appointments.length)} detail={`DNA ${dna}`} icon={ChartNoAxesCombined} tone="blue" />
        <MetricCard label="Collected" value={formatEur(revenue)} detail="Stripe + recorded payments" icon={ChartNoAxesCombined} tone="amber" />
        <MetricCard label="Síle calls" value={String(state.sileCalls.length)} detail="Logged with transcript" icon={ChartNoAxesCombined} tone="purple" />
      </div>
    </div>
  );
}
