import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function ShipmentTimeline() {
  return (
    <SectionCard title="Event Timeline" subtitle="Movement events, delays, reroutes, and deliveries">
      <EmptyState label="Timeline events will render here" />
    </SectionCard>
  );
}
