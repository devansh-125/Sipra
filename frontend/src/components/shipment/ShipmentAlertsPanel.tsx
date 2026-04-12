import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function ShipmentAlertsPanel() {
  return (
    <SectionCard title="Active Alerts" subtitle="Shipment-specific warnings and disruptions">
      <EmptyState label="Active shipment alerts list" />
    </SectionCard>
  );
}
