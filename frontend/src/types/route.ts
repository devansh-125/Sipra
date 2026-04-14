import type { ApiPaginationQuery } from './api.ts';

export type RouteTriggerType = 'initial' | 'disruption' | 'manual' | 'AI';

export type RoutePlan = {
  id: string;
  shipment_id: string;
  version_no?: number;
  is_active?: boolean;
  status?: string;
  trigger_type?: RouteTriggerType | string;
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

export type NetworkNodeQuery = ApiPaginationQuery & {
  type?: string;
  is_active?: boolean;
  city?: string;
  country?: string;
};

export type NetworkEdgeQuery = ApiPaginationQuery & {
  from_node_id?: string;
  to_node_id?: string;
  transport_mode?: string;
  is_blocked?: boolean;
  is_active?: boolean;
};

export type RouteMetrics = {
  eta_text: string;
  distance_km: number;
  risk_label: string;
  weather_exposure: string;
  stops: number;
};

export type RouteComparison = {
  current: RouteMetrics;
  suggested: RouteMetrics;
  recommendation: string;
};
