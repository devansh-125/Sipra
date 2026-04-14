import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LastUpdatedStamp from '../realtime/LastUpdatedStamp.tsx';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { ShipmentRecord } from '../../types/shipment.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';
import { toNumber, clamp, rankShipment, parseApiError } from '../../utils/helpers.ts';
import { normalizeRiskLabel } from '../../utils/riskUtils.ts';
import { getPriorityTone, getStatusTone } from '../../utils/statusColors.ts';

type ShipmentSummaryCardProps = {
  shipmentId?: string;
};

function formatEtaValue(value?: string | null): string {
  if (!value) {
    return 'ETA unavailable';
  }

  const etaDate = new Date(value);
  if (Number.isNaN(etaDate.getTime())) {
    return value;
  }

  const now = Date.now();
  const diffMin = Math.round((etaDate.getTime() - now) / 60000);
  const clock = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffMin <= 0) {
    return `Due now (${clock})`;
  }

  return `In ${formatMinutesToEta(diffMin)} (${clock})`;
}

export default function ShipmentSummaryCard({ shipmentId }: ShipmentSummaryCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const loadShipmentSummary = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      let selected: ShipmentRecord | null = null;

      if (shipmentId) {
        const byId = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
        selected = byId.data || null;
      } else {
        const list = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
        const active = (list.data || []).filter(
          (item) => item.status !== 'delivered' && item.status !== 'cancelled'
        );
        selected = active.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
      }

      setShipment(selected);
      setLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(parseApiError(loadError, 'Unable to load shipment overview'));
      setShipment(null);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadShipmentSummary();
  }, [loadShipmentSummary]);

  const delayProbability = clamp(toNumber(shipment?.delay_probability, 0));
  const predictedDelay = Math.max(0, Math.round(toNumber(shipment?.predicted_delay_min, 0)));
  const progress = Math.max(0, Math.min(100, Math.round(toNumber(shipment?.progress_percentage, 0))));
  const riskLabel = normalizeRiskLabel(delayProbability);

  const statusLabel = useMemo(() => {
    if (!shipment) {
      return '';
    }
    return shipment.status.replace(/_/g, ' ');
  }, [shipment]);

  return (
    <SectionCard title="Shipment Overview" subtitle="Tracking number, status, ETA, and origin-destination">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadShipmentSummary()}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !shipment ? (
        <EmptyState label="No shipment data available for summary." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-100">{shipment.tracking_number}</p>
              <div className="flex items-center gap-2">
                <StatusBadge text={statusLabel} tone={getStatusTone(shipment.status)} />
                <StatusBadge text={String(shipment.priority || 'medium')} tone={getPriorityTone(shipment.priority)} />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              {shipment.origin} <span className="text-slate-500">to</span> {shipment.destination}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="rounded-md border border-slate-700 bg-slate-950/50 p-2">
              <p className="text-slate-400">Current ETA</p>
              <p className="mt-1 font-semibold text-slate-100">{formatEtaValue(shipment.current_eta || shipment.planned_arrival)}</p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
              <p className="text-amber-200/90">Predicted Delay</p>
              <p className="mt-1 font-semibold text-amber-100">{formatMinutesToEta(predictedDelay)}</p>
            </div>
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2">
              <p className="text-cyan-200/90">Delay Probability</p>
              <p className="mt-1 font-semibold text-cyan-100">{formatPercent(delayProbability)}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/50 p-2">
              <p className="text-slate-400">Risk Level</p>
              <p className="mt-1 font-semibold text-slate-100">{riskLabel}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/50 p-2">
              <p className="text-slate-400">Progress</p>
              <p className="mt-1 font-semibold text-slate-100">{progress}%</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/50 p-2">
              <p className="text-slate-400">Cargo Weight</p>
              <p className="mt-1 font-semibold text-slate-100">
                {shipment.weight_kg != null ? `${Math.round(toNumber(shipment.weight_kg, 0))} kg` : 'Not provided'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Cargo: <span className="text-slate-300">{shipment.cargo_type || 'General'}</span>
            </p>
            <button
              type="button"
              onClick={() => void loadShipmentSummary()}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Refresh
            </button>
          </div>

          {shipment.updated_at || loadedAt ? (
            <LastUpdatedStamp lastUpdatedAt={shipment.updated_at || loadedAt || new Date().toISOString()} staleAfterSeconds={90} />
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
