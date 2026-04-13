import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import { alertsApi } from '../../services/api/alertsApi.ts';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { AlertItem } from '../../types/alert.ts';
import type { Shipment } from '../../types/shipment.ts';
import { getStatusTone } from '../../utils/statusColors.ts';

type ShipmentAlertsPanelProps = {
  shipmentId?: string;
};

type ShipmentRecord = Shipment & {
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: string | null;
};

type AlertRecord = AlertItem & {
  message?: string;
  alert_type?: string;
  shipment_id?: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function rankShipment(shipment: ShipmentRecord): number {
  const probability = toNumber(shipment.delay_probability, 0);
  const predictedDelayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const riskLevel = String(shipment.risk_level || '').toLowerCase();
  const riskLevelWeight = riskLevel === 'critical' ? 1 : riskLevel === 'high' ? 0.8 : riskLevel === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, riskLevelWeight * 0.7 + predictedDelayWeight * 0.3);
}

function getSeverityTone(severity: number): 'red' | 'yellow' | 'blue' {
  if (severity >= 8) {
    return 'red';
  }

  if (severity >= 5) {
    return 'yellow';
  }

  return 'blue';
}

function toRelativeTime(timestamp?: string): string {
  if (!timestamp) {
    return 'just now';
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return 'just now';
  }

  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAlertType(value?: string): string {
  if (!value) {
    return 'general';
  }

  return value.replace(/_/g, ' ');
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load alerts';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message || error.message;
  } catch {
    return error.message;
  }
}

export default function ShipmentAlertsPanel({ shipmentId }: ShipmentAlertsPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [markingAlertId, setMarkingAlertId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetShipment, setTargetShipment] = useState<ShipmentRecord | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [sourceMode, setSourceMode] = useState<'shipment' | 'network'>('shipment');

  const loadAlerts = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      let target: ShipmentRecord | null = null;

      if (shipmentId) {
        const shipmentRes = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
        target = shipmentRes.data || null;
      } else {
        const shipmentsRes = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
        const activeShipments = (shipmentsRes.data || []).filter(
          (shipment) => shipment.status !== 'delivered' && shipment.status !== 'cancelled'
        );
        target = activeShipments.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
      }

      setTargetShipment(target);

      if (!target) {
        setAlerts([]);
        return;
      }

      let shipmentAlerts: AlertRecord[] = [];

      try {
        const byShipmentRes = (await alertsApi.listByShipment(target.id, { limit: 6 })) as ApiResponse<AlertRecord[]>;
        shipmentAlerts = byShipmentRes.data || [];
      } catch {
        const byQueryRes = (await alertsApi.list({ shipment_id: target.id, limit: 6 })) as ApiResponse<AlertRecord[]>;
        shipmentAlerts = byQueryRes.data || [];
      }

      if (shipmentAlerts.length > 0) {
        setSourceMode('shipment');
        setAlerts(
          shipmentAlerts
            .sort((a, b) => toNumber(b.severity, 0) - toNumber(a.severity, 0))
            .slice(0, 5)
        );
        return;
      }

      const fallbackRes = (await alertsApi.list({ is_read: false, severity_gte: 6, limit: 6 })) as ApiResponse<AlertRecord[]>;
      setSourceMode('network');
      setAlerts(
        (fallbackRes.data || [])
          .sort((a, b) => toNumber(b.severity, 0) - toNumber(a.severity, 0))
          .slice(0, 5)
      );
    } catch (loadError) {
      setError(parseErrorMessage(loadError));
      setAlerts([]);
      setTargetShipment(null);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const openCount = useMemo(() => alerts.filter((alert) => !alert.is_read).length, [alerts]);
  const criticalCount = useMemo(() => alerts.filter((alert) => toNumber(alert.severity, 0) >= 8).length, [alerts]);

  const handleMarkRead = useCallback(async (alertId: string) => {
    setError(null);
    setMarkingAlertId(alertId);

    try {
      await alertsApi.markRead(alertId);
      setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, is_read: true } : alert)));
    } catch (markError) {
      setError(parseErrorMessage(markError));
    } finally {
      setMarkingAlertId(null);
    }
  }, []);

  return (
    <SectionCard title="Active Alerts" subtitle="Shipment-specific warnings and disruptions">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadAlerts()}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !targetShipment ? (
        <EmptyState label="No active shipment available to map alerts." />
      ) : alerts.length === 0 ? (
        <EmptyState label={`No active alerts for ${targetShipment.tracking_number}.`} />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-100">{targetShipment.tracking_number}</p>
              <StatusBadge text={targetShipment.status.replace('_', ' ')} tone={getStatusTone(targetShipment.status)} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Open alerts: {openCount} | Critical: {criticalCount}</p>
            {sourceMode === 'network' ? (
              <p className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                No direct shipment alerts found. Showing highest-priority network alerts.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {alerts.map((alert) => {
              const severity = toNumber(alert.severity, 0);

              return (
                <article key={alert.id} className="rounded-lg border border-slate-700 bg-slate-950/55 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-100 line-clamp-2">{alert.title}</p>
                      {alert.message ? <p className="mt-1 text-[11px] text-slate-300 line-clamp-2">{alert.message}</p> : null}
                    </div>
                    <StatusBadge text={`S${severity}`} tone={getSeverityTone(severity)} />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>{formatAlertType(alert.alert_type)}</span>
                    <span>{toRelativeTime(alert.created_at)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    {alert.is_read ? (
                      <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-400">Read</span>
                    ) : (
                      <span className="rounded-full border border-cyan-500/40 px-2 py-0.5 text-[11px] text-cyan-200">Unread</span>
                    )}

                    {!alert.is_read ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(alert.id)}
                        disabled={markingAlertId === alert.id}
                        className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-400 disabled:opacity-60"
                      >
                        {markingAlertId === alert.id ? 'Marking...' : 'Mark read'}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
