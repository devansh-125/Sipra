import type { AlertItem } from './alert.ts';
import type { Shipment } from './shipment.ts';

export type DashboardTrendDirection = 'up' | 'down' | 'flat';

export type DashboardKpi = {
  label: string;
  value: number | string;
  trend?: DashboardTrendDirection;
};

export type DashboardSummary = {
  kpis: DashboardKpi[];
};

export type DashboardShipmentSummary = {
  total: number;
  pending: number;
  in_transit: number;
  delayed: number;
  delivered: number;
  cancelled: number;
};

export type DashboardDisruptionSummary = {
  active: number;
};

export type DashboardAlertSummary = {
  open: number;
};

export type DashboardDelaySummary = {
  avg_predicted_delay_min: number;
  avg_delay_probability: number;
};

export type DashboardSummaryResponse = {
  shipments: DashboardShipmentSummary;
  disruptions: DashboardDisruptionSummary;
  alerts: DashboardAlertSummary;
  delays: DashboardDelaySummary;
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

export type ShipmentRiskBucket = {
  risk_level: string;
  count: number;
};

export type DisruptionSeverityBucket = {
  severity_bucket: string;
  count: number;
};

export type RouteRiskBucket = {
  risk_bucket: string;
  count: number;
};

export type RiskDistributionResponse = {
  shipments: ShipmentRiskBucket[];
  disruptions: DisruptionSeverityBucket[];
  routes: RouteRiskBucket[];
};

export type DashboardOverviewResponse = {
  summary: DashboardSummaryResponse;
  delayTrends: DelayTrendRow[];
  bottlenecks: BottlenecksResponse;
  mapData: MapDataResponse;
  riskDistribution: RiskDistributionResponse;
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

export type DashboardOverviewQuery = {
  days?: number;
  bottleneckLimit?: number;
  mapLimit?: number;
};

export type UseDashboardDataOptions = {
  enabled?: boolean;
  refreshIntervalMs?: number;
  delayTrendDays?: number;
  bottleneckLimit?: number;
  mapLimit?: number;
  alertLimit?: number;
};
