import SectionCard from '../common/SectionCard.tsx';

const kpis = [
  'Active Shipments',
  'On-Time %',
  'Delayed Shipments',
  'High Risk Shipments',
  'Active Disruptions',
  'Avg Predicted Delay'
];

export default function KpiCardsRow() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
      {kpis.map((label) => (
        <SectionCard key={label} title={label}>
          <div className="text-2xl font-bold">--</div>
        </SectionCard>
      ))}
    </section>
  );
}
