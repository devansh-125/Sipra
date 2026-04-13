import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Shipment } from '../../types/shipment.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';
import { normalizeRiskLabel } from '../../utils/riskUtils.ts';

type ShipmentWithMeta = Shipment & {
  updated_at?: string | null;
};

type Factor = {
  label: string;
  score: number;
};

type InsightSnapshot = {
  delayProbability: number;
  predictedDelayMin: number;
  confidence: number;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Critical';
  modelVersion: string;
  lastPredictionTime: string;
  factors: Factor[];
  sampleSize: number;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function toPercentText(value: number): string {
  return formatPercent(clamp(value));
}

function getRiskTone(riskLabel: InsightSnapshot['riskLabel']) {
  if (riskLabel === 'Critical') {
    return 'text-rose-300';
  }
  if (riskLabel === 'High') {
    return 'text-amber-300';
  }
  if (riskLabel === 'Medium') {
    return 'text-yellow-300';
  }
  return 'text-emerald-300';
}

function deriveInsights(shipments: ShipmentWithMeta[]): InsightSnapshot {
  const predictedShipments = shipments.filter((shipment) => shipment.delay_probability != null);
  const probabilities = predictedShipments.map((shipment) => clamp(Number(shipment.delay_probability || 0)));
  const avgProbability = average(probabilities);

  const delayMinutes = shipments
    .map((shipment) => Number(shipment.predicted_delay_min || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgDelayMinutes = Math.round(average(delayMinutes));

  const delayedRatio = clamp(shipments.filter((shipment) => shipment.status === 'delayed').length / Math.max(1, shipments.length));
  const highRiskRatio = clamp(
    shipments.filter((shipment) => {
      const label = String(shipment.risk_level || '').toLowerCase();
      return label === 'high' || label === 'critical' || Number(shipment.delay_probability || 0) >= 0.6;
    }).length / Math.max(1, shipments.length)
  );
  const inTransitRatio = clamp(
    shipments.filter((shipment) => shipment.status === 'in_transit').length / Math.max(1, shipments.length)
  );

  const factors: Factor[] = [
    { label: 'Delay Pressure', score: avgProbability },
    { label: 'Disruption Impact', score: delayedRatio * 0.8 + highRiskRatio * 0.2 },
    { label: 'Congestion Signal', score: inTransitRatio * 0.45 + avgProbability * 0.55 },
    { label: 'Risk Concentration', score: highRiskRatio },
    { label: 'SLA Stress', score: clamp(avgDelayMinutes / 180) }
  ]
    .map((factor) => ({ ...factor, score: clamp(factor.score) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const coverageScore = clamp(predictedShipments.length / Math.max(1, shipments.length));
  const sampleScore = clamp(Math.min(shipments.length, 20) / 20);
  const confidence = clamp(coverageScore * 0.6 + sampleScore * 0.4);

  const lastPredictionMs = shipments
    .map((shipment) => (shipment.updated_at ? Date.parse(shipment.updated_at) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  const latest = lastPredictionMs.length ? new Date(Math.max(...lastPredictionMs)).toLocaleTimeString() : 'N/A';

  return {
    delayProbability: avgProbability,
    predictedDelayMin: avgDelayMinutes,
    confidence,
    riskLabel: normalizeRiskLabel(avgProbability),
    modelVersion: 'heuristic-fleet-insights-v1',
    lastPredictionTime: latest,
    factors,
    sampleSize: shipments.length
  };
}

export default function AiInsightsPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shipments, setShipments] = useState<ShipmentWithMeta[]>([]);

  const loadInsights = useCallback(async () => {
    setError(null);
    try {
      const response = (await shipmentsApi.list()) as ApiResponse<ShipmentWithMeta[]>;
      setShipments(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load AI insights';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInsights();

    const refreshTimer = window.setInterval(() => {
      void loadInsights();
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [loadInsights]);

  const insight = useMemo(() => {
    if (!shipments.length) {
      return null;
    }
    return deriveInsights(shipments);
  }, [shipments]);

  return (
    <SectionCard title="AI Insights" subtitle="Delay probability, factors, confidence, and model info">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
          <button
            type="button"
            onClick={() => void loadInsights()}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !insight ? (
        <EmptyState label="No shipment prediction data yet. Seed demo data to generate AI insights." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-200/80">Delay Probability</p>
              <p className="text-xl font-bold text-cyan-100">{toPercentText(insight.delayProbability)}</p>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-200/80">Predicted Delay</p>
              <p className="text-xl font-bold text-amber-100">{formatMinutesToEta(insight.predictedDelayMin)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Risk Level</span>
              <span className={`font-semibold ${getRiskTone(insight.riskLabel)}`}>{insight.riskLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-300">Confidence</span>
              <span className="font-semibold text-slate-100">{toPercentText(insight.confidence)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Top Factors</p>
            {insight.factors.map((factor) => (
              <div key={factor.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{factor.label}</span>
                  <span className="text-slate-400">{toPercentText(factor.score)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.round(factor.score * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
            <p>Model: {insight.modelVersion}</p>
            <p>Last prediction: {insight.lastPredictionTime}</p>
            <p>Sample size: {insight.sampleSize} shipments</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
