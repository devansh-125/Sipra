import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import { routesApi } from '../../services/api/routesApi.ts';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Shipment } from '../../types/shipment.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';

type ShipmentRecord = Shipment & {
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: string | null;
};

type AlternativeRoute = {
  shipment_id: string;
  recommendation_score?: number | string;
  time_difference?: number | string;
};

type RerouteActionCardProps = {
  shipmentId?: string;
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

function formatEtaDelta(minutes: number): string {
  if (minutes === 0) {
    return 'No ETA change';
  }

  if (minutes < 0) {
    return `${formatMinutesToEta(Math.abs(minutes))} faster`;
  }

  return `${formatMinutesToEta(minutes)} slower`;
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Action failed';
  }

  const raw = error.message;
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    return parsed.message || raw;
  } catch {
    return raw;
  }
}

export default function RerouteActionCard({ shipmentId }: RerouteActionCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [targetShipment, setTargetShipment] = useState<ShipmentRecord | null>(null);
  const [topAlternative, setTopAlternative] = useState<AlternativeRoute | null>(null);

  const loadSuggestion = useCallback(async () => {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      let candidate: ShipmentRecord | null = null;

      if (shipmentId) {
        const detail = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
        candidate = detail.data || null;
      } else {
        const list = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
        const actionable = (list.data || []).filter(
          (shipment) => shipment.status !== 'delivered' && shipment.status !== 'cancelled'
        );

        candidate = actionable.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
      }

      if (!candidate) {
        setTargetShipment(null);
        setTopAlternative(null);
        return;
      }

      setTargetShipment(candidate);

      try {
        const alternatives = (await routesApi.getAlternatives(candidate.id)) as ApiResponse<AlternativeRoute[]>;
        setTopAlternative((alternatives.data || [])[0] || null);
      } catch {
        setTopAlternative(null);
      }
    } catch (loadError) {
      setError(parseErrorMessage(loadError));
      setTargetShipment(null);
      setTopAlternative(null);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadSuggestion();
  }, [loadSuggestion]);

  const recommendationScore = useMemo(() => {
    if (!topAlternative) {
      return 0;
    }
    return toNumber(topAlternative.recommendation_score, 0);
  }, [topAlternative]);

  async function handleReroute() {
    if (!targetShipment) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      await routesApi.rerouteShipment(
        targetShipment.id,
        'Manual reroute from Shipment Detail action card to reduce predicted delay'
      );

      setResult(`Reroute triggered for ${targetShipment.tracking_number}.`);
      await loadSuggestion();
    } catch (submitError) {
      setError(parseErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SectionCard title="Route Actions" subtitle="Apply AI recommendation when reroute is available">
      <div className="space-y-3">
        {isLoading ? (
          <div className="h-16 rounded-md bg-slate-800 animate-pulse" />
        ) : !targetShipment ? (
          <p className="text-xs text-slate-400">No active shipment available for reroute.</p>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{targetShipment.tracking_number}</p>
              <StatusBadge text={targetShipment.status.replace('_', ' ')} tone="blue" />
            </div>
            <p className="mt-1 text-slate-400">Risk score: {formatPercent(rankShipment(targetShipment))}</p>

            {topAlternative ? (
              <div className="mt-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2">
                <p className="text-cyan-100">Top recommendation: {formatPercent(recommendationScore)}</p>
                <p className="text-cyan-200/85">ETA impact: {formatEtaDelta(Math.round(toNumber(topAlternative.time_difference, 0)))}</p>
              </div>
            ) : (
              <p className="mt-2 text-slate-400">No alternate route preview available yet.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void loadSuggestion()}
            disabled={isSubmitting}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold hover:border-slate-500 disabled:opacity-60"
          >
            Refresh Suggestion
          </button>
          <button
            type="button"
            onClick={() => void handleReroute()}
            disabled={isSubmitting || isLoading || !targetShipment}
            className="rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold hover:bg-sky-500 disabled:opacity-60"
          >
            {isSubmitting ? 'Rerouting...' : 'Reroute Shipment'}
          </button>
        </div>

        {error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
        ) : null}
        {result ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200">{result}</p>
        ) : null}
      </div>
    </SectionCard>
  );
}
