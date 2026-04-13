import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import { dashboardApi } from '../../services/api/dashboardApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import { formatMinutesToEta, formatPercent } from '../../utils/formatters.ts';

type SummaryResponse = {
  shipments: {
    total: number;
    pending: number;
    in_transit: number;
    delayed: number;
    delivered: number;
    cancelled: number;
  };
  disruptions: {
    active: number;
  };
  alerts: {
    open: number;
  };
  delays: {
    avg_predicted_delay_min: number;
    avg_delay_probability: number;
  };
};

type RiskDistributionResponse = {
  shipments: Array<{ risk_level: string; count: number }>;
};

type KpiItem = {
  label: string;
  value: string;
  helper: string;
  tone: 'cyan' | 'emerald' | 'rose' | 'amber' | 'violet' | 'sky';
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toneClasses(tone: KpiItem['tone']) {
  if (tone === 'emerald') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  if (tone === 'rose') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  }
  if (tone === 'amber') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
  if (tone === 'violet') {
    return 'border-violet-500/30 bg-violet-500/10 text-violet-200';
  }
  if (tone === 'sky') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  }
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
}

export default function KpiCardsRow() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [highRiskShipments, setHighRiskShipments] = useState(0);

  const loadKpis = useCallback(async () => {
    setError(null);

    try {
      const [summaryRes, riskRes] = await Promise.all([
        dashboardApi.getSummary() as Promise<ApiResponse<SummaryResponse>>,
        dashboardApi.getRiskDistribution() as Promise<ApiResponse<RiskDistributionResponse>>
      ]);

      setSummary(summaryRes.data || null);

      const shipmentBuckets = riskRes.data?.shipments || [];
      const highRiskCount = shipmentBuckets
        .filter((bucket) => {
          const label = String(bucket.risk_level || '').toLowerCase();
          return label === 'high' || label === 'critical';
        })
        .reduce((sum, bucket) => sum + toNumber(bucket.count, 0), 0);

      setHighRiskShipments(highRiskCount);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load KPI metrics';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKpis();

    const refreshTimer = window.setInterval(() => {
      void loadKpis();
    }, 30000);

    return () => window.clearInterval(refreshTimer);
  }, [loadKpis]);

  const kpis = useMemo<KpiItem[]>(() => {
    if (!summary) {
      return [];
    }

    const activeShipments = summary.shipments.in_transit + summary.shipments.pending;
    const completedWindow = summary.shipments.delivered + summary.shipments.delayed;
    const onTimeRatio = completedWindow > 0 ? summary.shipments.delivered / completedWindow : 0;

    return [
      {
        label: 'Active Shipments',
        value: String(activeShipments),
        helper: `${summary.shipments.total} total`,
        tone: 'cyan'
      },
      {
        label: 'On-Time %',
        value: formatPercent(onTimeRatio),
        helper: `${summary.shipments.delivered} delivered`,
        tone: 'emerald'
      },
      {
        label: 'Delayed Shipments',
        value: String(summary.shipments.delayed),
        helper: `${summary.alerts.open} open alerts`,
        tone: 'rose'
      },
      {
        label: 'High Risk Shipments',
        value: String(highRiskShipments),
        helper: `${formatPercent(summary.delays.avg_delay_probability)} avg delay risk`,
        tone: 'amber'
      },
      {
        label: 'Active Disruptions',
        value: String(summary.disruptions.active),
        helper: `${summary.alerts.open} open alerts`,
        tone: 'violet'
      },
      {
        label: 'Avg Predicted Delay',
        value: formatMinutesToEta(Math.round(summary.delays.avg_predicted_delay_min || 0)),
        helper: `${Math.round(summary.delays.avg_predicted_delay_min || 0)} min`,
        tone: 'sky'
      }
    ];
  }, [highRiskShipments, summary]);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
      {isLoading
        ? Array.from({ length: 6 }).map((_, index) => (
            <SectionCard key={`kpi-loading-${index}`} title="Loading...">
              <div className="h-10 rounded-md bg-slate-800 animate-pulse" />
            </SectionCard>
          ))
        : error
          ? Array.from({ length: 6 }).map((_, index) => (
              <SectionCard key={`kpi-error-${index}`} title="KPI Error">
                <p className="text-xs text-rose-300 line-clamp-2">{error}</p>
              </SectionCard>
            ))
          : kpis.map((kpi) => (
              <SectionCard key={kpi.label} title={kpi.label}>
                <div className={`rounded-lg border px-3 py-2 ${toneClasses(kpi.tone)}`}>
                  <div className="text-2xl font-bold leading-none">{kpi.value}</div>
                  <div className="mt-1 text-xs opacity-80">{kpi.helper}</div>
                </div>
              </SectionCard>
            ))}
    </section>
  );
}
