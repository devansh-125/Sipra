import SectionCard from '../common/SectionCard.tsx';
import StatusBadge from '../common/StatusBadge.tsx';

export default function ShipmentSummaryCard() {
  return (
    <SectionCard title="Shipment Overview" subtitle="Tracking number, status, ETA, and origin-destination">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>Tracking Number: DEMO-1001</div>
        <div>Status: <StatusBadge text="In Transit" tone="green" /></div>
        <div>Current ETA: 12h 40m</div>
        <div>Origin: Delhi</div>
        <div>Destination: Mumbai</div>
        <div>Predicted Delay: 38 min</div>
      </div>
    </SectionCard>
  );
}
