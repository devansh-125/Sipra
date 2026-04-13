import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import { alertsApi } from '../../services/api/alertsApi.ts';
import { dashboardApi } from '../../services/api/dashboardApi.ts';
import { routesApi } from '../../services/api/routesApi.ts';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { AlertItem } from '../../types/alert.ts';
import type { Shipment } from '../../types/shipment.ts';
import { formatPercent } from '../../utils/formatters.ts';
import { getStatusTone } from '../../utils/statusColors.ts';

type AlertRecord = AlertItem & {
  severity?: number;
  message?: string;
};

type ShipmentRecord = Shipment & {
  risk_level?: string | null;
  delay_probability?: number | null;
};

type BottleneckNode = {
  id: string;
  name: string;
  city?: string;
  congestion_score?: number | string;
  event_count?: number | string;
};

type AlternativeRoute = {
  shipment_id: string;
  recommendation_score?: number | string;
  time_difference?: number | string;
};

type RerouteSuggestion = {
  shipmentId: string;
  trackingNumber: string;
  recommendationScore: number;
  timeDifferenceMin: number;
};

type PanelData = {
  alerts: AlertRecord[];
  riskyShipments: ShipmentRecord[];
  bottleneckNodes: BottleneckNode[];
  rerouteSuggestions: RerouteSuggestion[];
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toRiskScore(shipment: ShipmentRecord): number {
  const probability = toNumber(shipment.delay_probability, 0);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelScore = level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : level === 'low' ? 0.3 : 0;
  return Math.max(probability, levelScore);
}

function formatTimeDifference(minutes: number): string {
  if (minutes < 0) {
    return `${Math.abs(Math.round(minutes))} min faster`;
  }

  if (minutes === 0) {
    return 'No ETA change';
  }

  return `${Math.round(minutes)} min slower`;
}

function formatAlertTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'just now';
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardSidePanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelData, setPanelData] = useState<PanelData>({
    alerts: [],
    riskyShipments: [],
    bottleneckNodes: [],
    rerouteSuggestions: []
  });

  const loadPanelData = useCallback(async () => {
    setError(null);

    try {
      const [alertsRes, bottlenecksRes, shipmentsRes] = await Promise.all([
        alertsApi.list() as Promise<ApiResponse<AlertRecord[]>>,
        dashboardApi.getBottlenecks(8) as Promise<ApiResponse<{ nodes: BottleneckNode[] }>>,
        shipmentsApi.list() as Promise<ApiResponse<ShipmentRecord[]>>
      ]);

      const activeAlerts = (alertsRes.data || [])
        .filter((alert) => !alert.is_read)
        .sort((a, b) => toNumber(b.severity, 0) - toNumber(a.severity, 0))
        .slice(0, 4);

      const riskyShipments = (shipmentsRes.data || [])
        .filter((shipment) => shipment.status !== 'delivered' && shipment.status !== 'cancelled')
        .sort((a, b) => toRiskScore(b) - toRiskScore(a))
        .slice(0, 4);

      const bottleneckNodes = (bottlenecksRes.data?.nodes || [])
        .sort((a, b) => {
          const aScore = toNumber(a.congestion_score, 0) * 0.7 + toNumber(a.event_count, 0) * 0.3;
          const bScore = toNumber(b.congestion_score, 0) * 0.7 + toNumber(b.event_count, 0) * 0.3;
          return bScore - aScore;
        })
        .slice(0, 4);

      const rerouteCandidateShipments = riskyShipments.slice(0, 3);
      const routeAlternatives = await Promise.all(
        rerouteCandidateShipments.map(async (shipment) => {
          try {
            const alternativesRes = (await routesApi.getAlternatives(shipment.id)) as ApiResponse<AlternativeRoute[]>;
            const topAlternative = (alternativesRes.data || [])[0];

            if (!topAlternative) {
              return null;
            }

            return {
              shipmentId: shipment.id,
              trackingNumber: shipment.tracking_number,
              recommendationScore: toNumber(topAlternative.recommendation_score, 0),
              timeDifferenceMin: toNumber(topAlternative.time_difference, 0)
            } as RerouteSuggestion;
          } catch {
            return null;
          }
        })
      );

      const rerouteSuggestions = routeAlternatives
        .filter((item): item is RerouteSuggestion => Boolean(item))
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
        .slice(0, 3);

      setPanelData({
        alerts: activeAlerts,
        riskyShipments,
        bottleneckNodes,
        rerouteSuggestions
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load live ops panel';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPanelData();

    const refreshTimer = window.setInterval(() => {
      void loadPanelData();
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [loadPanelData]);

  const hasContent = useMemo(() => {
    return (
      panelData.alerts.length > 0 ||
      panelData.riskyShipments.length > 0 ||
      panelData.bottleneckNodes.length > 0 ||
      panelData.rerouteSuggestions.length > 0
    );
  }, [panelData]);

  return (
    <SectionCard title="Live Ops Panel" subtitle="Alerts, risk, bottlenecks, reroute suggestions">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
          <button
            type="button"
            onClick={() => void loadPanelData()}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !hasContent ? (
        <EmptyState label="No live ops data yet. Seed demo data to populate alerts and suggestions." />
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Active Alerts</h3>
            {panelData.alerts.length === 0 ? (
              <EmptyState label="No active alerts" />
            ) : (
              <div className="space-y-2">
                {panelData.alerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-100 line-clamp-1">{alert.title}</p>
                      <StatusBadge text={`S${toNumber(alert.severity, 0)}`} tone={toNumber(alert.severity, 0) >= 8 ? 'red' : 'yellow'} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{formatAlertTime(alert.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Top Risky Shipments</h3>
            {panelData.riskyShipments.length === 0 ? (
              <EmptyState label="No risky shipments" />
            ) : (
              <div className="space-y-2">
                {panelData.riskyShipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-100">{shipment.tracking_number}</p>
                      <StatusBadge text={shipment.status.replace('_', ' ')} tone={getStatusTone(shipment.status)} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Risk: {formatPercent(toRiskScore(shipment))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Bottleneck Hubs</h3>
            {panelData.bottleneckNodes.length === 0 ? (
              <EmptyState label="No bottleneck hubs" />
            ) : (
              <div className="space-y-2">
                {panelData.bottleneckNodes.map((node) => (
                  <div key={node.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                    <p className="text-xs text-slate-100 line-clamp-1">{node.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {node.city || 'Unknown city'} | Congestion {formatPercent(toNumber(node.congestion_score, 0))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Reroute Suggestions</h3>
            {panelData.rerouteSuggestions.length === 0 ? (
              <EmptyState label="No reroute suggestions available" />
            ) : (
              <div className="space-y-2">
                {panelData.rerouteSuggestions.map((suggestion) => (
                  <div key={suggestion.shipmentId} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-100">{suggestion.trackingNumber}</p>
                      <StatusBadge text={formatPercent(suggestion.recommendationScore)} tone="blue" />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{formatTimeDifference(suggestion.timeDifferenceMin)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
