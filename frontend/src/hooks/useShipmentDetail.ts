import { useCallback, useEffect, useMemo, useState } from 'react';
import { shipmentsApi } from '../services/api/shipmentsApi.ts';
import { alertsApi } from '../services/api/alertsApi.ts';
import { routesApi } from '../services/api/routesApi.ts';
import { useRealtime } from './useRealtime.ts';
import type { ApiResponse } from '../types/api.ts';
import type { Shipment } from '../types/shipment.ts';
import type { AlertItem } from '../types/alert.ts';
import { POLLING_INTERVAL_MS } from '../utils/constants.ts';

type ShipmentRecord = Shipment & {
  updated_at?: string | null;
  priority?: string | null;
  progress_percentage?: number | null;
  cargo_type?: string | null;
  weight_kg?: number | null;
  planned_arrival?: string | null;
};

export type ShipmentEvent = {
  id: string;
  shipment_id: string;
  event_type: 'created' | 'moved' | 'delayed' | 'rerouted' | 'delivered' | string;
  node_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  event_time: string;
  source?: 'simulator' | 'user' | 'rule_engine' | 'AI' | string;
  metadata_json?: Record<string, unknown> | null;
};

export type ActiveRouteData = {
  routePlan: Record<string, unknown>;
  segments: Array<Record<string, unknown>>;
};

export type AlternativeRoute = {
  id?: string;
  shipment_id?: string;
  recommendation_score?: number | string;
  time_difference?: number | string;
  cost_difference?: number | string;
  alternative_waypoints?: string[];
};

export type ShipmentDetailData = {
  shipment: ShipmentRecord | null;
  events: ShipmentEvent[];
  alerts: AlertItem[];
  activeRoute: ActiveRouteData | null;
  alternatives: AlternativeRoute[];
  source: 'requested' | 'auto' | null;
  fetchedAt: string | null;
};

type UseShipmentDetailOptions = {
  shipmentId?: string;
  autoSelectIfMissing?: boolean;
  refreshIntervalMs?: number;
  alternativesLimit?: number;
  alertsLimit?: number;
  realtimeRefresh?: boolean;
};

type RefreshOptions = {
  silent?: boolean;
};

const DEFAULT_DATA: ShipmentDetailData = {
  shipment: null,
  events: [],
  alerts: [],
  activeRoute: null,
  alternatives: [],
  source: null,
  fetchedAt: null
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function rankShipment(shipment: ShipmentRecord): number {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelWeight = level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, levelWeight * 0.65 + delayWeight * 0.35);
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load shipment detail';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string; error?: string };
    return parsed.message || parsed.error || error.message;
  } catch {
    return error.message;
  }
}

function extractRealtimeShipmentId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { shipmentId?: unknown; shipment_id?: unknown };

  if (typeof candidate.shipmentId === 'string') {
    return candidate.shipmentId;
  }

  if (typeof candidate.shipment_id === 'string') {
    return candidate.shipment_id;
  }

  return null;
}

async function loadAlertsForShipment(shipmentId: string, limit: number): Promise<AlertItem[]> {
  try {
    const scoped = (await alertsApi.listByShipment(shipmentId, { limit })) as ApiResponse<AlertItem[]>;
    return scoped.data || [];
  } catch {
    const fallback = (await alertsApi.list({ shipment_id: shipmentId, limit })) as ApiResponse<AlertItem[]>;
    return fallback.data || [];
  }
}

async function loadActiveRoute(shipmentId: string): Promise<ActiveRouteData | null> {
  try {
    const response = (await routesApi.getActiveRoute(shipmentId)) as ApiResponse<ActiveRouteData>;
    return response.data || null;
  } catch (error) {
    const message = parseErrorMessage(error).toLowerCase();
    if (message.includes('active route not found') || message.includes('not found')) {
      return null;
    }

    throw error;
  }
}

async function loadAlternatives(shipmentId: string, limit: number): Promise<AlternativeRoute[]> {
  try {
    const response = (await routesApi.getAlternatives(shipmentId)) as ApiResponse<AlternativeRoute[]>;
    return (response.data || []).slice(0, Math.max(1, limit));
  } catch (error) {
    const message = parseErrorMessage(error).toLowerCase();
    if (message.includes('not found')) {
      return [];
    }
    throw error;
  }
}

export function useShipmentDetail(options: UseShipmentDetailOptions = {}) {
  const {
    shipmentId,
    autoSelectIfMissing = true,
    refreshIntervalMs = POLLING_INTERVAL_MS,
    alternativesLimit = 3,
    alertsLimit = 20,
    realtimeRefresh = true
  } = options;

  const [data, setData] = useState<ShipmentDetailData>(DEFAULT_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const realtime = useRealtime({ autoConnect: realtimeRefresh });

  const refresh = useCallback(
    async ({ silent = false }: RefreshOptions = {}) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        let target: ShipmentRecord | null = null;
        let source: 'requested' | 'auto' | null = null;

        if (shipmentId) {
          const detail = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
          target = detail.data || null;
          source = 'requested';
        } else if (autoSelectIfMissing) {
          const list = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
          const active = (list.data || []).filter(
            (item) => item.status !== 'delivered' && item.status !== 'cancelled'
          );

          target = active.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
          source = target ? 'auto' : null;
        }

        if (!target) {
          setData({
            ...DEFAULT_DATA,
            source,
            fetchedAt: new Date().toISOString()
          });
          return;
        }

        const [eventsRes, alerts, activeRoute, alternatives] = await Promise.all([
          shipmentsApi.getEvents(target.id) as Promise<ApiResponse<ShipmentEvent[]>>,
          loadAlertsForShipment(target.id, alertsLimit),
          loadActiveRoute(target.id),
          loadAlternatives(target.id, alternativesLimit)
        ]);

        const events = (eventsRes.data || []).sort(
          (a, b) => Date.parse(b.event_time || '') - Date.parse(a.event_time || '')
        );

        setData({
          shipment: target,
          events,
          alerts,
          activeRoute,
          alternatives,
          source,
          fetchedAt: new Date().toISOString()
        });
      } catch (loadError) {
        setError(parseErrorMessage(loadError));
      } finally {
        if (silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [alertsLimit, alternativesLimit, autoSelectIfMissing, shipmentId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (refreshIntervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, refreshIntervalMs);

    return () => window.clearInterval(timer);
  }, [refresh, refreshIntervalMs]);

  useEffect(() => {
    if (!realtimeRefresh) {
      return;
    }

    const watchedEvents = [
      'shipment:updated',
      'shipment:rerouted',
      'shipment:delayed',
      'shipment:delivered',
      'alert:new',
      'dashboard:refresh'
    ];

    const handler = (payload: unknown) => {
      const eventShipmentId = extractRealtimeShipmentId(payload);
      const targetId = data.shipment?.id || shipmentId || null;

      if (!targetId || !eventShipmentId || eventShipmentId === targetId) {
        void refresh({ silent: true });
      }
    };

    watchedEvents.forEach((eventName) => {
      realtime.on(eventName, handler);
    });

    return () => {
      watchedEvents.forEach((eventName) => {
        realtime.off(eventName, handler);
      });
    };
  }, [data.shipment?.id, realtime, realtimeRefresh, refresh, shipmentId]);

  const hasData =
    data.shipment !== null ||
    data.events.length > 0 ||
    data.alerts.length > 0 ||
    data.activeRoute !== null ||
    data.alternatives.length > 0;

  return useMemo(
    () => ({
      isLoading,
      isRefreshing,
      error,
      data,
      hasData,
      refresh,
      realtime: {
        connectionState: realtime.connectionState,
        isConnected: realtime.isConnected,
        lastEventName: realtime.lastEventName,
        lastEventAt: realtime.lastEventAt,
        lastError: realtime.lastError
      }
    }),
    [data, error, hasData, isLoading, isRefreshing, realtime.connectionState, realtime.isConnected, realtime.lastError, realtime.lastEventAt, realtime.lastEventName, refresh]
  );
}
