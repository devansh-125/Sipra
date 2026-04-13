import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';

export type RoutePlan = {
  id: string;
  shipment_id: string;
  version_no?: number;
  is_active?: boolean;
  status?: string;
  trigger_type?: string;
  total_distance_km?: number | string;
  total_duration_min?: number | string;
  risk_score?: number | string;
  comparison_summary_json?: Record<string, unknown>;
};

export type RouteSegment = {
  id?: string;
  route_plan_id?: string;
  edge_id?: string;
  sequence_no?: number;
  distance_km?: number | string;
  duration_min?: number | string;
  risk_score?: number | string;
};

export type ActiveRouteResponse = {
  routePlan: RoutePlan;
  segments: RouteSegment[];
};

export type AlternativeRoute = {
  id?: string;
  shipment_id?: string;
  original_route_id?: string | null;
  alternative_waypoints?: string[];
  time_difference?: number | string;
  cost_difference?: number | string;
  recommendation_score?: number | string;
};

export type RouteTriggerType = 'initial' | 'disruption' | 'manual' | 'AI';

export type PlanRoutePayload = {
  trigger_type?: RouteTriggerType;
  reason?: string;
};

export type ReroutePayload = {
  trigger_type?: RouteTriggerType;
  reason?: string;
};

export type RoutePlanMutationResponse = {
  routePlan: RoutePlan;
  route?: Record<string, unknown> | null;
  segments?: RouteSegment[];
  alternatives?: AlternativeRoute[];
};

export type NetworkNode = {
  id: string;
  name: string;
  type?: string;
  city?: string;
  country?: string;
  latitude?: number | string;
  longitude?: number | string;
  is_active?: boolean;
};

export type NetworkEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  transport_mode?: string;
  is_blocked?: boolean;
  is_active?: boolean;
  current_risk_score?: number | string;
};

export type NetworkNodeQuery = {
  type?: string;
  is_active?: boolean;
  city?: string;
  country?: string;
  limit?: number;
  offset?: number;
};

export type NetworkEdgeQuery = {
  from_node_id?: string;
  to_node_id?: string;
  transport_mode?: string;
  is_blocked?: boolean;
  is_active?: boolean;
  limit?: number;
  offset?: number;
};

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
