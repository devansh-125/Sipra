import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell.tsx';
import PageHeader from '../../components/layout/PageHeader.tsx';
import ShipmentSummaryCard from '../../components/shipment/ShipmentSummaryCard.tsx';
import ShipmentAiReasonCard from '../../components/shipment/ShipmentAiReasonCard.tsx';
import RouteComparisonCard from '../../components/shipment/RouteComparisonCard.tsx';
import ShipmentTimeline from '../../components/shipment/ShipmentTimeline.tsx';
import ShipmentAlertsPanel from '../../components/shipment/ShipmentAlertsPanel.tsx';
import RerouteActionCard from '../../components/shipment/RerouteActionCard.tsx';
import EmptyState from '../../components/common/EmptyState.tsx';
import LoadingBlock from '../../components/common/LoadingBlock.tsx';
import LastUpdatedStamp from '../../components/realtime/LastUpdatedStamp.tsx';
import RealtimeStatusBadge from '../../components/realtime/RealtimeStatusBadge.tsx';
import { useShipmentDetail } from '../../hooks/useShipmentDetail.ts';

export default function ShipmentDetailPage() {
  const { shipmentId } = useParams<{ shipmentId: string }>();

  const { isLoading, isRefreshing, error, data, refresh, realtime } = useShipmentDetail({
    shipmentId,
    autoSelectIfMissing: true,
    realtimeRefresh: true
  });

  const selectedShipmentId = data.shipment?.id;

  const headerBadges = useMemo(() => {
    const badges: string[] = [];

    if (data.shipment?.tracking_number) {
      badges.push(data.shipment.tracking_number);
    }

    if (data.shipment?.status) {
      badges.push(`Status: ${data.shipment.status.replace(/_/g, ' ')}`);
    }

    badges.push(`Events: ${data.events.length}`);
    badges.push(`Alerts: ${data.alerts.filter((item) => !item.is_read).length} open`);

    return badges;
  }, [data.alerts, data.events.length, data.shipment?.status, data.shipment?.tracking_number]);

  const title = data.shipment?.tracking_number
    ? `Shipment Detail | ${data.shipment.tracking_number}`
    : 'Shipment Detail';

  const tone = error ? 'rose' : data.shipment?.status === 'delayed' ? 'amber' : 'cyan';

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title={title}
          subtitle="Tracking state, delay risk, route decisions, and live event timeline"
          eyebrow="Shipment Control"
          tone={tone}
          badges={headerBadges}
          rightSlot={
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <RealtimeStatusBadge state={realtime.connectionState} compact />
                <button
                  type="button"
                  onClick={() => void refresh({ silent: true })}
                  disabled={isLoading || isRefreshing}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh Detail'}
                </button>
              </div>
              {data.fetchedAt ? <LastUpdatedStamp lastUpdatedAt={data.fetchedAt} staleAfterSeconds={60} /> : null}
            </div>
          }
        />

        {error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {isLoading && !selectedShipmentId ? (
          <LoadingBlock />
        ) : !selectedShipmentId ? (
          <EmptyState label="No active shipment found. Seed demo data or create shipments to open detail view." />
        ) : (
          <>
            <ShipmentSummaryCard shipmentId={selectedShipmentId} />

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <RouteComparisonCard shipmentId={selectedShipmentId} />
                <ShipmentTimeline shipmentId={selectedShipmentId} />
              </div>
              <div className="xl:col-span-1 space-y-6">
                <ShipmentAiReasonCard shipmentId={selectedShipmentId} />
                <ShipmentAlertsPanel shipmentId={selectedShipmentId} />
                <RerouteActionCard shipmentId={selectedShipmentId} />
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
