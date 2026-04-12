import AppShell from '../../components/layout/AppShell.tsx';
import PageHeader from '../../components/layout/PageHeader.tsx';
import ShipmentSummaryCard from '../../components/shipment/ShipmentSummaryCard.tsx';
import ShipmentAiReasonCard from '../../components/shipment/ShipmentAiReasonCard.tsx';
import RouteComparisonCard from '../../components/shipment/RouteComparisonCard.tsx';
import ShipmentTimeline from '../../components/shipment/ShipmentTimeline.tsx';
import ShipmentAlertsPanel from '../../components/shipment/ShipmentAlertsPanel.tsx';
import RerouteActionCard from '../../components/shipment/RerouteActionCard.tsx';

export default function ShipmentDetailPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Shipment Detail"
          subtitle="Tracking state, delay risk, route decisions, and live event timeline"
        />

        <ShipmentSummaryCard />

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <RouteComparisonCard />
            <ShipmentTimeline />
          </div>
          <div className="xl:col-span-1 space-y-6">
            <ShipmentAiReasonCard />
            <ShipmentAlertsPanel />
            <RerouteActionCard />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
