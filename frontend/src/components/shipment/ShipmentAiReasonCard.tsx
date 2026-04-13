import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Shipment } from '../../types/shipment.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';
import { normalizeRiskLabel } from '../../utils/riskUtils.ts';

type ShipmentRecord = Shipment & {
  updated_at?: string | null;
  priority?: string | null;
};

type Factor = {
  label: string;
  score: number;
  reason: string;
};

type ShipmentAiReasonCardProps = {
  shipmentId?: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function shipmentRank(shipment: ShipmentRecord): number {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelWeight = level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, levelWeight * 0.65 + delayWeight * 0.35);
}

function buildFactors(shipment: ShipmentRecord): Factor[] {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayMin = Math.max(0, toNumber(shipment.predicted_delay_min, 0));
  const status = shipment.status;
  const priority = String(shipment.priority || 'medium').toLowerCase();

  const congestionSignal = clamp(probability * 0.55 + Math.min(1, delayMin / 210) * 0.45);
  const disruptionImpact = clamp(
    (status === 'delayed' ? 0.7 : status === 'in_transit' ? 0.45 : 0.3) + probability * 0.25
  );
  const priorityPressure = clamp((priority === 'critical' ? 0.8 : priority === 'high' ? 0.62 : 0.4) * 0.75 + probability * 0.25);
  const networkExposure = clamp(Math.min(1, delayMin / 180) * 0.6 + probability * 0.4);

  return [
    {
      label: 'Congestion Signal',
      score: congestionSignal,
      reason: `Current indicators suggest bottleneck pressure near the active route corridor.`
    },
    {
      label: 'Disruption Impact',
      score: disruptionImpact,
      reason: `Shipment status and route conditions imply active disruption influence on ETA.`
    },
    {
      label: 'Priority Pressure',
      score: priorityPressure,
      reason: `Operational priority class increases sensitivity to delay SLA breaches.`
    },
    {
      label: 'Network Exposure',
      score: networkExposure,
      reason: `Predicted travel time spread indicates higher exposure to route uncertainty.`
    }
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load AI reason data';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message || error.message;
  } catch {
    return error.message;
  }
}

export default function ShipmentAiReasonCard({ shipmentId }: ShipmentAiReasonCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);

  const loadShipment = useCallback(async () => {
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
        selected = active.sort((a, b) => shipmentRank(b) - shipmentRank(a))[0] || null;
      }

      setShipment(selected);
    } catch (loadError) {
      setError(parseErrorMessage(loadError));
      setShipment(null);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadShipment();
  }, [loadShipment]);

  const factors = useMemo(() => {
    if (!shipment) {
      return [] as Factor[];
    }
    return buildFactors(shipment);
  }, [shipment]);

  const delayProbability = clamp(toNumber(shipment?.delay_probability, 0));
  const predictedDelayMin = Math.max(0, Math.round(toNumber(shipment?.predicted_delay_min, 0)));
  const confidence = clamp((delayProbability * 0.6 + Math.min(1, predictedDelayMin / 180) * 0.4) * 0.9 + 0.08);
  const modelVersion = 'heuristic-delay-explainer-v1';
  const lastPrediction = shipment?.updated_at ? new Date(shipment.updated_at).toLocaleTimeString() : 'N/A';

  const recommendation = useMemo(() => {
    if (!shipment) {
      return null;
    }

    const riskLabel = normalizeRiskLabel(delayProbability);
    if (riskLabel === 'High' || riskLabel === 'Critical') {
      return `High-delay likelihood detected for ${shipment.tracking_number}. Prioritize reroute and close alert watch.`;
    }

    if (riskLabel === 'Medium') {
      return `Moderate delay risk for ${shipment.tracking_number}. Keep route under active monitoring.`;
    }

    return `Shipment ${shipment.tracking_number} currently shows low delay risk. Continue normal operations.`;
  }, [delayProbability, shipment]);

  return (
    <SectionCard title="AI Reasons" subtitle="Why this shipment might be delayed">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadShipment()}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !shipment ? (
        <EmptyState label="No shipment context available to generate AI reasons." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{shipment.tracking_number}</p>
              <p className="text-slate-400">{shipment.status.replace('_', ' ')}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2">
                <p className="text-[11px] text-cyan-200/90">Delay Probability</p>
                <p className="text-sm font-semibold text-cyan-100">{formatPercent(delayProbability)}</p>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                <p className="text-[11px] text-amber-200/90">Predicted Delay</p>
                <p className="text-sm font-semibold text-amber-100">{formatMinutesToEta(predictedDelayMin)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Top Factors</p>
            {factors.map((factor) => (
              <div key={factor.label} className="rounded-md border border-slate-700 bg-slate-950/55 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-200">{factor.label}</p>
                  <p className="text-xs text-slate-300">{formatPercent(factor.score)}</p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    style={{ width: `${Math.round(factor.score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{factor.reason}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-2 text-[11px] text-slate-300">
            <p>Risk Level: {normalizeRiskLabel(delayProbability)}</p>
            <p>Confidence: {formatPercent(confidence)}</p>
            <p>Model: {modelVersion}</p>
            <p>Last prediction: {lastPrediction}</p>
          </div>

          {recommendation ? (
            <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200">
              {recommendation}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
