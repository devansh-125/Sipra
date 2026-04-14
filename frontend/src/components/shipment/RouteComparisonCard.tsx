import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import { routesApi } from '../../services/api/routesApi.ts';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { ShipmentRecord } from '../../types/shipment.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';
import { toNumber, clamp, rankShipment, parseApiError } from '../../utils/helpers.ts';

type ActiveRouteResponse = {
  routePlan: {
    total_duration_min?: number | string;
    total_distance_km?: number | string;
    risk_score?: number | string;
  };
  segments: Array<{
    sequence_no?: number;
  }>;
};

type AlternativeRoute = {
  recommendation_score?: number | string;
  time_difference?: number | string;
  cost_difference?: number | string;
  alternative_waypoints?: string[];
};

type RouteComparisonCardProps = {
  shipmentId?: string;
};

type ComparisonData = {
  trackingNumber: string;
  currentEtaMin: number;
  newEtaMin: number;
  currentDistanceKm: number;
  newDistanceKm: number;
  currentRisk: number;
  newRisk: number;
  currentStops: number;
  newStops: number;
  currentDelayProbability: number;
  newDelayProbability: number;
  recommendationScore: number;
};

function riskLabel(score: number): string {
  if (score >= 0.8) {
    return 'Critical';
  }
  if (score >= 0.6) {
    return 'High';
  }
  if (score >= 0.35) {
    return 'Medium';
  }
  return 'Low';
}

function exposureLabel(score: number): string {
  if (score >= 0.75) {
    return 'Severe';
  }
  if (score >= 0.5) {
    return 'Moderate';
  }
  return 'Low';
}

export default function RouteComparisonCard({ shipmentId }: RouteComparisonCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);

  const loadComparison = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      let targetShipment: ShipmentRecord | null = null;

      if (shipmentId) {
        const shipmentRes = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
        targetShipment = shipmentRes.data || null;
      } else {
        const shipmentsRes = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
        const candidates = (shipmentsRes.data || []).filter(
          (shipment) => shipment.status !== 'delivered' && shipment.status !== 'cancelled'
        );
        targetShipment = candidates.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
      }

      if (!targetShipment) {
        setComparison(null);
        return;
      }

      const [activeRes, alternativesRes] = await Promise.all([
        routesApi.getActiveRoute(targetShipment.id) as Promise<ApiResponse<ActiveRouteResponse>>,
        routesApi.getAlternatives(targetShipment.id) as Promise<ApiResponse<AlternativeRoute[]>>
      ]);

      const active = activeRes.data;
      const bestAlternative = (alternativesRes.data || [])[0];

      if (!active || !bestAlternative) {
        setComparison(null);
        return;
      }

      const currentEtaMin = Math.max(0, Math.round(toNumber(active.routePlan.total_duration_min, 0)));
      const currentDistanceKm = Math.max(0, toNumber(active.routePlan.total_distance_km, 0));
      const currentRisk = clamp(toNumber(active.routePlan.risk_score, rankShipment(targetShipment)));
      const currentStops = Math.max(1, active.segments.length);

      const etaDelta = toNumber(bestAlternative.time_difference, 0);
      const distanceDelta = toNumber(bestAlternative.cost_difference, 0);
      const recommendationScore = clamp(toNumber(bestAlternative.recommendation_score, 0));

      const newEtaMin = Math.max(1, Math.round(currentEtaMin + etaDelta));
      const newDistanceKm = Math.max(1, currentDistanceKm + distanceDelta);
      const newRisk = clamp(currentRisk * (1 - recommendationScore * 0.55));
      const newStops = Array.isArray(bestAlternative.alternative_waypoints)
        ? Math.max(1, bestAlternative.alternative_waypoints.length - 1)
        : Math.max(1, currentStops - 1);

      const currentDelayProbability = clamp(toNumber(targetShipment.delay_probability, currentRisk));
      const newDelayProbability = clamp(currentDelayProbability * (1 - recommendationScore * 0.65));

      setComparison({
        trackingNumber: targetShipment.tracking_number,
        currentEtaMin,
        newEtaMin,
        currentDistanceKm,
        newDistanceKm,
        currentRisk,
        newRisk,
        currentStops,
        newStops,
        currentDelayProbability,
        newDelayProbability,
        recommendationScore
      });
    } catch (loadError) {
      setError(parseApiError(loadError, 'Unable to load route comparison'));
      setComparison(null);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  const recommendationSentence = useMemo(() => {
    if (!comparison) {
      return null;
    }

    return `Recommended route lowers delay probability from ${formatPercent(comparison.currentDelayProbability)} to ${formatPercent(comparison.newDelayProbability)} with score ${formatPercent(comparison.recommendationScore)}.`;
  }, [comparison]);

  return (
    <SectionCard title="Route Comparison" subtitle="Current route vs suggested route from live network scoring">
      {isLoading ? (
        <div className="h-20 rounded-md bg-slate-800 animate-pulse" />
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadComparison()}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !comparison ? (
        <p className="text-sm text-slate-400">No active route comparison available yet. Generate route plans to compare.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400">Shipment: {comparison.trackingNumber}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300">
                  <th className="py-2">Metric</th>
                  <th className="py-2">Current Route</th>
                  <th className="py-2">Suggested Route</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                <tr>
                  <td className="py-2">ETA</td>
                  <td>{formatMinutesToEta(comparison.currentEtaMin)}</td>
                  <td>{formatMinutesToEta(comparison.newEtaMin)}</td>
                </tr>
                <tr>
                  <td className="py-2">Distance</td>
                  <td>{comparison.currentDistanceKm.toFixed(0)} km</td>
                  <td>{comparison.newDistanceKm.toFixed(0)} km</td>
                </tr>
                <tr>
                  <td className="py-2">Risk</td>
                  <td>{riskLabel(comparison.currentRisk)}</td>
                  <td>{riskLabel(comparison.newRisk)}</td>
                </tr>
                <tr>
                  <td className="py-2">Weather Exposure</td>
                  <td>{exposureLabel(comparison.currentRisk)}</td>
                  <td>{exposureLabel(comparison.newRisk)}</td>
                </tr>
                <tr>
                  <td className="py-2">Stops</td>
                  <td>{comparison.currentStops}</td>
                  <td>{comparison.newStops}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {recommendationSentence ? <p className="mt-3 text-sm text-emerald-300">{recommendationSentence}</p> : null}
        </>
      )}
    </SectionCard>
  );
}
