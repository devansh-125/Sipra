import type {
  BottlenecksResponse,
  DashboardKpi,
  DashboardSummary,
  DashboardSummaryResponse,
  DelayTrendRow,
  MapDataResponse,
  RiskDistributionResponse
} from '../../types/dashboard.ts';

export type DashboardDelayTrendPoint = {
  day: string;
  delayed: number;
  delivered: number;
  avgDelayMin: number;
};

export type DashboardRoutePerformancePoint = {
  mode: string;
  avgRiskPct: number;
  blocked: number;
};

export type DashboardRiskDistributionPoint = {
  name: string;
  value: number;
};

export type DashboardDisruptionFrequencyPoint = {
  type: string;
  count: number;
  active: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toLabelCase(value: string): string {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function mapDashboardSummary(raw: DashboardSummaryResponse | null | undefined, highRiskShipments = 0): DashboardSummary {
  if (!raw) {
    return { kpis: [] };
  }

  const shipments = raw.shipments || {
    total: 0,
    pending: 0,
    in_transit: 0,
    delayed: 0,
    delivered: 0,
    cancelled: 0
  };

  const disruptions = raw.disruptions || { active: 0 };
  const alerts = raw.alerts || { open: 0 };
  const delays = raw.delays || {
    avg_predicted_delay_min: 0,
    avg_delay_probability: 0
  };

  const activeShipments = shipments.in_transit + shipments.pending;
  const completedWindow = shipments.delivered + shipments.delayed;
  const onTimeRatio = completedWindow > 0 ? shipments.delivered / completedWindow : 0;

  const kpis: DashboardKpi[] = [
    {
      label: 'Active Shipments',
      value: activeShipments,
      trend: 'flat'
    },
    {
      label: 'On-Time %',
      value: `${toPercent(onTimeRatio)}%`,
      trend: onTimeRatio >= 0.8 ? 'up' : onTimeRatio <= 0.6 ? 'down' : 'flat'
    },
    {
      label: 'Delayed Shipments',
      value: shipments.delayed,
      trend: shipments.delayed > 0 ? 'down' : 'flat'
    },
    {
      label: 'High Risk Shipments',
      value: highRiskShipments,
      trend: highRiskShipments > 0 ? 'down' : 'flat'
    },
    {
      label: 'Active Disruptions',
      value: disruptions.active,
      trend: disruptions.active > 0 ? 'down' : 'flat'
    },
    {
      label: 'Open Alerts',
      value: alerts.open,
      trend: alerts.open > 0 ? 'down' : 'flat'
    },
    {
      label: 'Avg Predicted Delay',
      value: `${Math.round(toNumber(delays.avg_predicted_delay_min, 0))} min`,
      trend: toNumber(delays.avg_predicted_delay_min, 0) > 30 ? 'down' : 'flat'
    },
    {
      label: 'Avg Delay Risk',
      value: `${toPercent(toNumber(delays.avg_delay_probability, 0))}%`,
      trend: toNumber(delays.avg_delay_probability, 0) > 0.6 ? 'down' : 'flat'
    }
  ];

  return { kpis };
}

export function mapDelayTrends(rows: DelayTrendRow[] | null | undefined): DashboardDelayTrendPoint[] {
  return (rows || []).map((row) => ({
    day: toDayLabel(row.day),
    delayed: toNumber(row.delayed_count, 0),
    delivered: toNumber(row.delivered_count, 0),
    avgDelayMin: toNumber(row.avg_predicted_delay_min, 0)
  }));
}

export function mapRoutePerformance(bottlenecks: BottlenecksResponse | null | undefined): DashboardRoutePerformancePoint[] {
  const edges = bottlenecks?.edges || [];
  const grouped: Record<string, { totalRisk: number; count: number; blocked: number }> = {};

  for (const edge of edges) {
    const mode = String(edge.transport_mode || 'unknown').toUpperCase();
    grouped[mode] = grouped[mode] || { totalRisk: 0, count: 0, blocked: 0 };
    grouped[mode].totalRisk += toNumber(edge.current_risk_score, 0);
    grouped[mode].count += 1;

    if (edge.is_blocked) {
      grouped[mode].blocked += 1;
    }
  }

  return Object.entries(grouped)
    .map(([mode, aggregate]) => ({
      mode,
      avgRiskPct: Number(((aggregate.totalRisk / Math.max(1, aggregate.count)) * 100).toFixed(1)),
      blocked: aggregate.blocked
    }))
    .sort((a, b) => b.avgRiskPct - a.avgRiskPct)
    .slice(0, 6);
}

export function mapRiskDistribution(distribution: RiskDistributionResponse | null | undefined): DashboardRiskDistributionPoint[] {
  return (distribution?.shipments || [])
    .map((row) => ({
      name: toLabelCase(row.risk_level),
      value: toNumber(row.count, 0)
    }))
    .filter((row) => row.value > 0);
}

export function mapDisruptionFrequency(mapData: MapDataResponse | null | undefined): DashboardDisruptionFrequencyPoint[] {
  const buckets: Record<string, { count: number; active: number }> = {};

  for (const disruption of mapData?.disruptions || []) {
    const type = toLabelCase(String(disruption.type || 'unknown'));
    buckets[type] = buckets[type] || { count: 0, active: 0 };
    buckets[type].count += 1;

    if (String(disruption.status || '').toLowerCase() === 'active') {
      buckets[type].active += 1;
    }
  }

  return Object.entries(buckets)
    .map(([type, aggregate]) => ({
      type,
      count: aggregate.count,
      active: aggregate.active
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
