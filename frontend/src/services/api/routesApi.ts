import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type {
  ActiveRouteResponse,
  AlternativeRoute,
  NetworkEdge,
  NetworkEdgeQuery,
  NetworkNode,
  NetworkNodeQuery,
  PlanRoutePayload,
  ReroutePayload,
  RoutePlanMutationResponse
} from '../../types/route.ts';

export type {
  ActiveRouteResponse,
  AlternativeRoute,
  NetworkEdge,
  NetworkEdgeQuery,
  NetworkNode,
  NetworkNodeQuery,
  PlanRoutePayload,
  ReroutePayload,
  RouteComparison,
  RouteMetrics,
  RoutePlan,
  RoutePlanMutationResponse,
  RouteSegment,
  RouteTriggerType
} from '../../types/route.ts';

function toInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizePaging(limit?: number, offset?: number): { limit?: number; offset?: number } {
  const parsedLimit = toInt(limit);
  const parsedOffset = toInt(offset);

  return {
    limit: parsedLimit == null ? undefined : clamp(parsedLimit, 1, 1000),
    offset: parsedOffset == null ? undefined : Math.max(0, parsedOffset)
  };
}

function toReroutePayload(input?: string | ReroutePayload): ReroutePayload {
  if (typeof input === 'string') {
    return {
      trigger_type: 'manual',
      reason: toCleanString(input)
    };
  }

  return {
    trigger_type: input?.trigger_type || 'manual',
    reason: toCleanString(input?.reason)
  };
}

export const routesApi = {
  planInitialRoute: (shipmentId: string, payload?: PlanRoutePayload) =>
    apiRequest<ApiResponse<RoutePlanMutationResponse>>(`/api/routes/plan/${encodeURIComponent(shipmentId)}`, {
      method: 'POST',
      body: JSON.stringify({
        trigger_type: payload?.trigger_type || 'initial',
        reason: toCleanString(payload?.reason)
      })
    }),
  getActiveRoute: (shipmentId: string) =>
    apiRequest<ApiResponse<ActiveRouteResponse>>(`/api/routes/${encodeURIComponent(shipmentId)}`),
  getAlternatives: (shipmentId: string, limit?: number) =>
    apiRequest<ApiResponse<AlternativeRoute[]>>(`/api/routes/${encodeURIComponent(shipmentId)}/alternatives`, {
      query: {
        ...sanitizePaging(limit, undefined)
      }
    }),
  getBestAlternative: async (shipmentId: string, limit = 3) => {
    const response = await routesApi.getAlternatives(shipmentId, limit);
    return (response.data || [])[0] || null;
  },
  rerouteShipment: (shipmentId: string, reasonOrPayload?: string | ReroutePayload) =>
    apiRequest<ApiResponse<RoutePlanMutationResponse>>(`/api/routes/${encodeURIComponent(shipmentId)}/reroute`, {
      method: 'POST',
      body: JSON.stringify(toReroutePayload(reasonOrPayload))
    }),
  listNetworkNodes: (query?: NetworkNodeQuery) =>
    apiRequest<ApiResponse<NetworkNode[]>>('/api/network/nodes', {
      query: {
        type: toCleanString(query?.type),
        is_active: query?.is_active,
        city: toCleanString(query?.city),
        country: toCleanString(query?.country),
        ...sanitizePaging(query?.limit, query?.offset)
      }
    }),
  listNetworkEdges: (query?: NetworkEdgeQuery) =>
    apiRequest<ApiResponse<NetworkEdge[]>>('/api/network/edges', {
      query: {
        from_node_id: toCleanString(query?.from_node_id),
        to_node_id: toCleanString(query?.to_node_id),
        transport_mode: toCleanString(query?.transport_mode),
        is_blocked: query?.is_blocked,
        is_active: query?.is_active,
        ...sanitizePaging(query?.limit, query?.offset)
      }
    })
};

export const routeApi = routesApi;
