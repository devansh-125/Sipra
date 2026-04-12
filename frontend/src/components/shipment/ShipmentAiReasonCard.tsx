import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function ShipmentAiReasonCard() {
  return (
    <SectionCard title="AI Reasons" subtitle="Why this shipment might be delayed">
      <EmptyState label="Show top factors such as weather, congestion, and disruptions" />
    </SectionCard>
  );
}
