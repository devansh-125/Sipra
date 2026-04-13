import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';

export type DashboardSummaryResponse = {
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

export type DelayTrendRow = {
  day: string;
  delayed_count: number;
  delivered_count: number;
  avg_predicted_delay_min: number;
};

export type BottleneckNode = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  type?: string;
  capacity_score?: number | string;
  congestion_score?: number | string;
  event_count?: number | string;
};

export type BottleneckEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  transport_mode?: string;
  current_risk_score?: number | string;
  is_blocked?: boolean;
  segment_count?: number | string;
};

export type BottlenecksResponse = {
  nodes: BottleneckNode[];
  edges: BottleneckEdge[];
};

export type DashboardMapShipment = {
  id: string;
  tracking_number: string;
  status: string;
  priority?: string;
  latitude: number | string;
  longitude: number | string;
};

export type DashboardMapDisruption = {
  id: string;
  type: string;
  severity: number | string;
  status: string;
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  latitude: number | string;
  longitude: number | string;
};

export type DashboardMapNode = {
  id: string;
  name: string;
  type: string;
  city?: string;
  country?: string;
  latitude: number | string;
  longitude: number | string;
};

export type MapDataResponse = {
  shipments: DashboardMapShipment[];
  disruptions: DashboardMapDisruption[];
  nodes: DashboardMapNode[];
};

export type RiskDistributionResponse = {
  shipments: Array<{ risk_level: string; count: number }>;
  disruptions: Array<{ severity_bucket: string; count: number }>;
  routes: Array<{ risk_bucket: string; count: number }>;
};

export type DashboardOverviewResponse = {
  summary: DashboardSummaryResponse;
  delayTrends: DelayTrendRow[];
  bottlenecks: BottlenecksResponse;
  mapData: MapDataResponse;
  riskDistribution: RiskDistributionResponse;
};

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDays(days: number): number {
  return clamp(toInt(days, 14), 1, 90);
}

function normalizeBottleneckLimit(limit: number): number {
  return clamp(toInt(limit, 10), 1, 50);
}

function normalizeMapLimit(limit: number): number {
  return clamp(toInt(limit, 300), 10, 1000);
}

export const dashboardApi = {
  getSummary: () => apiRequest<ApiResponse<DashboardSummaryResponse>>('/api/dashboard/summary'),
  getDelayTrends: (days = 14) =>
    apiRequest<ApiResponse<DelayTrendRow[]>>('/api/dashboard/delay-trends', {
      query: { days: normalizeDays(days) }
    }),
  getBottlenecks: (limit = 10) =>
    apiRequest<ApiResponse<BottlenecksResponse>>('/api/dashboard/bottlenecks', {
      query: { limit: normalizeBottleneckLimit(limit) }
    }),
  getMapData: (limit = 300) =>
    apiRequest<ApiResponse<MapDataResponse>>('/api/dashboard/map-data', {
      query: { limit: normalizeMapLimit(limit) }
    }),
  getRiskDistribution: () =>
    apiRequest<ApiResponse<RiskDistributionResponse>>('/api/dashboard/risk-distribution'),
  getOverview: async (options?: { days?: number; bottleneckLimit?: number; mapLimit?: number }) => {
    const days = normalizeDays(options?.days ?? 14);
    const bottleneckLimit = normalizeBottleneckLimit(options?.bottleneckLimit ?? 10);
    const mapLimit = normalizeMapLimit(options?.mapLimit ?? 300);

    const [summaryRes, trendsRes, bottlenecksRes, mapRes, riskRes] = await Promise.all([
      dashboardApi.getSummary(),
      dashboardApi.getDelayTrends(days),
      dashboardApi.getBottlenecks(bottleneckLimit),
      dashboardApi.getMapData(mapLimit),
      dashboardApi.getRiskDistribution()
    ]);

    return {
      summary: summaryRes.data,
      delayTrends: trendsRes.data || [],
      bottlenecks: bottlenecksRes.data || { nodes: [], edges: [] },
      mapData: mapRes.data || { shipments: [], disruptions: [], nodes: [] },
      riskDistribution: riskRes.data || { shipments: [], disruptions: [], routes: [] }
    } as DashboardOverviewResponse;
  }
};
