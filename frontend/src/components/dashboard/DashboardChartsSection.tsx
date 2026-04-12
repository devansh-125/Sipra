import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function DashboardChartsSection() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      <SectionCard title="Delay Trends"><EmptyState label="Delay trends chart" /></SectionCard>
      <SectionCard title="Route Performance"><EmptyState label="Route performance chart" /></SectionCard>
      <SectionCard title="Risk Distribution"><EmptyState label="Risk distribution chart" /></SectionCard>
      <SectionCard title="Disruption Frequency"><EmptyState label="Disruption frequency chart" /></SectionCard>
      <SectionCard title="Carrier Performance"><EmptyState label="Carrier performance chart" /></SectionCard>
    </section>
  );
}
