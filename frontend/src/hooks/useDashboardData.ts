import { useCallback, useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../services/api/dashboardApi.ts';
import { alertsApi } from '../services/api/alertsApi.ts';
import { shipmentsApi } from '../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../types/api.ts';
import type { AlertItem } from '../types/alert.ts';
import type { Shipment } from '../types/shipment.ts';
import { POLLING_INTERVAL_MS } from '../utils/constants.ts';

type DashboardSummaryResponse = {
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

type DelayTrendRow = {
  day: string;
  delayed_count: number;
  delivered_count: number;
  avg_predicted_delay_min: number;
};

type BottlenecksResponse = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

type MapDataResponse = {
  shipments: Array<Record<string, unknown>>;
  disruptions: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
};

type RiskDistributionResponse = {
  shipments: Array<{ risk_level: string; count: number }>;
  disruptions: Array<{ severity_bucket: string; count: number }>;
  routes: Array<{ risk_bucket: string; count: number }>;
};

export type DashboardDataBundle = {
  summary: DashboardSummaryResponse | null;
  delayTrends: DelayTrendRow[];
  bottlenecks: BottlenecksResponse;
  mapData: MapDataResponse;
  riskDistribution: RiskDistributionResponse | null;
  alerts: AlertItem[];
  shipments: Shipment[];
  fetchedAt: string | null;
};

type UseDashboardDataOptions = {
  enabled?: boolean;
  refreshIntervalMs?: number;
  delayTrendDays?: number;
  bottleneckLimit?: number;
  mapLimit?: number;
  alertLimit?: number;
};

type RefreshOptions = {
  silent?: boolean;
};

const DEFAULT_DATA: DashboardDataBundle = {
  summary: null,
  delayTrends: [],
  bottlenecks: {
    nodes: [],
    edges: []
  },
  mapData: {
    shipments: [],
    disruptions: [],
    nodes: []
  },
  riskDistribution: null,
  alerts: [],
  shipments: [],
  fetchedAt: null
};

function parseErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string; error?: string };
    return parsed.message || parsed.error || error.message;
  } catch {
    return error.message;
  }
}

export function useDashboardData(options: UseDashboardDataOptions = {}) {
  const {
    enabled = true,
    refreshIntervalMs = POLLING_INTERVAL_MS,
    delayTrendDays = 14,
    bottleneckLimit = 12,
    mapLimit = 300,
    alertLimit = 30
  } = options;

  const [data, setData] = useState<DashboardDataBundle>(DEFAULT_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      if (!enabled) {
        return;
      }

      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      const requests = await Promise.allSettled([
        dashboardApi.getSummary() as Promise<ApiResponse<DashboardSummaryResponse>>,
        dashboardApi.getDelayTrends(delayTrendDays) as Promise<ApiResponse<DelayTrendRow[]>>,
        dashboardApi.getBottlenecks(bottleneckLimit) as Promise<ApiResponse<BottlenecksResponse>>,
        dashboardApi.getMapData(mapLimit) as Promise<ApiResponse<MapDataResponse>>,
        dashboardApi.getRiskDistribution() as Promise<ApiResponse<RiskDistributionResponse>>,
        alertsApi.list({ limit: alertLimit }) as Promise<ApiResponse<AlertItem[]>>,
        shipmentsApi.list() as Promise<ApiResponse<Shipment[]>>
      ]);

      const [
        summaryRes,
        delayTrendsRes,
        bottlenecksRes,
        mapDataRes,
        riskRes,
        alertsRes,
        shipmentsRes
      ] = requests;

      const loadErrors: string[] = [];
      for (const request of requests) {
        if (request.status === 'rejected') {
          loadErrors.push(parseErrorText(request.reason));
        }
      }

      setData((previous) => ({
        summary: summaryRes.status === 'fulfilled' ? summaryRes.value.data || null : previous.summary,
        delayTrends: delayTrendsRes.status === 'fulfilled' ? delayTrendsRes.value.data || [] : previous.delayTrends,
        bottlenecks:
          bottlenecksRes.status === 'fulfilled'
            ? bottlenecksRes.value.data || { nodes: [], edges: [] }
            : previous.bottlenecks,
        mapData:
          mapDataRes.status === 'fulfilled'
            ? mapDataRes.value.data || { shipments: [], disruptions: [], nodes: [] }
            : previous.mapData,
        riskDistribution: riskRes.status === 'fulfilled' ? riskRes.value.data || null : previous.riskDistribution,
        alerts: alertsRes.status === 'fulfilled' ? alertsRes.value.data || [] : previous.alerts,
        shipments: shipmentsRes.status === 'fulfilled' ? shipmentsRes.value.data || [] : previous.shipments,
        fetchedAt: new Date().toISOString()
      }));

      if (loadErrors.length > 0) {
        setError(`Partial dashboard update: ${Array.from(new Set(loadErrors)).slice(0, 2).join(' | ')}`);
      }

      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    },
    [alertLimit, bottleneckLimit, delayTrendDays, enabled, mapLimit]
  );

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsRefreshing(false);
      setError(null);
      return;
    }

    void refresh();

    if (refreshIntervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, refresh, refreshIntervalMs]);

  return useMemo(
    () => ({
      isLoading,
      isRefreshing,
      error,
      data,
      refresh,
      hasData:
        data.summary !== null ||
        data.delayTrends.length > 0 ||
        data.alerts.length > 0 ||
        data.shipments.length > 0
    }),
    [data, error, isLoading, isRefreshing, refresh]
  );
}
