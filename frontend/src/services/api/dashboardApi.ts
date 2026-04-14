import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type {
  BottlenecksResponse,
  DashboardOverviewResponse,
  DashboardSummaryResponse,
  DelayTrendRow,
  MapDataResponse,
  RiskDistributionResponse
} from '../../types/dashboard.ts';

export type {
  BottleneckEdge,
  BottleneckNode,
  BottlenecksResponse,
  DashboardAlertSummary,
  DashboardDelaySummary,
  DashboardDisruptionSummary,
  DashboardMapDisruption,
  DashboardMapNode,
  DashboardMapShipment,
  DashboardOverviewResponse,
  DashboardShipmentSummary,
  DashboardSummaryResponse,
  DelayTrendRow,
  MapDataResponse,
  RiskDistributionResponse
} from '../../types/dashboard.ts';

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
