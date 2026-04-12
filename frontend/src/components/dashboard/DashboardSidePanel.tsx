import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function DashboardSidePanel() {
  return (
    <SectionCard title="Live Ops Panel" subtitle="Alerts, risk, bottlenecks, reroute suggestions">
      <div className="space-y-3">
        <EmptyState label="Active alerts list" />
        <EmptyState label="Top risky shipments" />
        <EmptyState label="Bottleneck hubs" />
        <EmptyState label="Reroute suggestions" />
      </div>
    </SectionCard>
  );
}
