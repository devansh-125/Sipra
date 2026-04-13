import type { AlertItem } from '../../types/alert.ts';
import type { Shipment, ShipmentStatus } from '../../types/shipment.ts';
import type { ActiveRouteResponse, AlternativeRoute, RoutePlan, RouteSegment } from '../api/routesApi.ts';

export type ShipmentRecord = Shipment & {
  updated_at?: string | null;
  priority?: string | null;
  progress_percentage?: number | null;
  cargo_type?: string | null;
  weight_kg?: number | null;
  planned_arrival?: string | null;
};

export type ShipmentEventRecord = {
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

export type ShipmentDetailMapped = {
  shipment: ShipmentRecord | null;
  events: ShipmentEventRecord[];
  alerts: AlertItem[];
  activeRoute: ActiveRouteResponse | null;
  alternatives: AlternativeRoute[];
  source: 'requested' | 'auto' | null;
  fetchedAt: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function toShipmentStatus(value: unknown): ShipmentStatus {
  const status = String(value || '').toLowerCase();

  if (status === 'pending') {
    return 'pending';
  }

  if (status === 'in_transit') {
    return 'in_transit';
  }

  if (status === 'delayed') {
    return 'delayed';
  }

  if (status === 'delivered') {
    return 'delivered';
  }

  return 'cancelled';
}

export function mapShipmentRecord(raw: unknown): ShipmentRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const id = toNonEmptyString(source.id);
  const tracking = toNonEmptyString(source.tracking_number);
  const origin = toNonEmptyString(source.origin);
  const destination = toNonEmptyString(source.destination);

  if (!id || !tracking || !origin || !destination) {
    return null;
  }

  return {
    id,
    tracking_number: tracking,
    status: toShipmentStatus(source.status),
    origin,
    destination,
    current_eta: toNonEmptyString(source.current_eta) || null,
    delay_probability: source.delay_probability == null ? null : clamp(toNumber(source.delay_probability, 0)),
    predicted_delay_min: source.predicted_delay_min == null ? null : Math.max(0, Math.round(toNumber(source.predicted_delay_min, 0))),
    risk_level: toNonEmptyString(source.risk_level) || null,
    updated_at: toIsoOrNull(source.updated_at),
    priority: toNonEmptyString(source.priority) || null,
    progress_percentage:
      source.progress_percentage == null
        ? null
        : Math.max(0, Math.min(100, Math.round(toNumber(source.progress_percentage, 0)))),
    cargo_type: toNonEmptyString(source.cargo_type) || null,
    weight_kg: source.weight_kg == null ? null : Math.max(0, toNumber(source.weight_kg, 0)),
    planned_arrival: toNonEmptyString(source.planned_arrival) || null
  };
}

export function mapShipmentEvent(raw: unknown): ShipmentEventRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const id = toNonEmptyString(source.id);
  const shipmentId = toNonEmptyString(source.shipment_id);
  const eventTime = toIsoOrNull(source.event_time);

  if (!id || !shipmentId || !eventTime) {
    return null;
  }

  const metadata = source.metadata_json;

  return {
    id,
    shipment_id: shipmentId,
    event_type: String(source.event_type || 'created'),
    node_id: toNonEmptyString(source.node_id) || null,
    latitude: source.latitude == null ? null : toNumber(source.latitude, Number.NaN),
    longitude: source.longitude == null ? null : toNumber(source.longitude, Number.NaN),
    description: toNonEmptyString(source.description) || null,
    event_time: eventTime,
    source: toNonEmptyString(source.source),
    metadata_json: metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null
  };
}

export function mapAlertRecord(raw: unknown): AlertItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const id = toNonEmptyString(source.id);
  const title = toNonEmptyString(source.title);
  const createdAt = toIsoOrNull(source.created_at);

  if (!id || !title || !createdAt) {
    return null;
  }

  return {
    id,
    shipment_id: toNonEmptyString(source.shipment_id) || null,
    disruption_id: toNonEmptyString(source.disruption_id) || null,
    alert_type: toNonEmptyString(source.alert_type),
    title,
    message: toNonEmptyString(source.message),
    severity: Math.max(1, Math.min(10, Math.round(toNumber(source.severity, 1)))),
    is_read: Boolean(source.is_read),
    created_at: createdAt,
    resolved_at: toIsoOrNull(source.resolved_at)
  };
}

function mapRoutePlan(raw: unknown): RoutePlan | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const id = toNonEmptyString(source.id);
  const shipmentId = toNonEmptyString(source.shipment_id);

  if (!id || !shipmentId) {
    return null;
  }

  return {
    id,
    shipment_id: shipmentId,
    version_no: source.version_no == null ? undefined : Math.max(1, Math.round(toNumber(source.version_no, 1))),
    is_active: source.is_active == null ? undefined : Boolean(source.is_active),
    status: toNonEmptyString(source.status),
    trigger_type: toNonEmptyString(source.trigger_type),
    total_distance_km: toStringOrNumber(source.total_distance_km),
    total_duration_min: toStringOrNumber(source.total_duration_min),
    risk_score: toStringOrNumber(source.risk_score),
    comparison_summary_json:
      source.comparison_summary_json && typeof source.comparison_summary_json === 'object'
        ? (source.comparison_summary_json as Record<string, unknown>)
        : undefined
  };
}

function mapRouteSegment(raw: unknown): RouteSegment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;

  return {
    id: toNonEmptyString(source.id),
    route_plan_id: toNonEmptyString(source.route_plan_id),
    edge_id: toNonEmptyString(source.edge_id),
    sequence_no: source.sequence_no == null ? undefined : Math.max(0, Math.round(toNumber(source.sequence_no, 0))),
    distance_km: toStringOrNumber(source.distance_km),
    duration_min: toStringOrNumber(source.duration_min),
    risk_score: toStringOrNumber(source.risk_score)
  };
}

export function mapActiveRoute(raw: unknown): ActiveRouteResponse | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const routePlan = mapRoutePlan(source.routePlan);

  if (!routePlan) {
    return null;
  }

  const segments = Array.isArray(source.segments)
    ? source.segments.map(mapRouteSegment).filter((item): item is RouteSegment => Boolean(item))
    : [];

  return {
    routePlan,
    segments
  };
}

export function mapAlternativeRoute(raw: unknown): AlternativeRoute | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const source = raw as Record<string, unknown>;

  return {
    id: toNonEmptyString(source.id),
    shipment_id: toNonEmptyString(source.shipment_id),
    original_route_id: toNonEmptyString(source.original_route_id) || null,
    alternative_waypoints: Array.isArray(source.alternative_waypoints)
      ? source.alternative_waypoints.map((item) => String(item))
      : undefined,
    time_difference: toStringOrNumber(source.time_difference),
    cost_difference: toStringOrNumber(source.cost_difference),
    recommendation_score: toStringOrNumber(source.recommendation_score)
  };
}

export function rankShipmentRisk(shipment: ShipmentRecord): number {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelWeight = level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, levelWeight * 0.65 + delayWeight * 0.35);
}

export function sortEventsNewestFirst(events: ShipmentEventRecord[]): ShipmentEventRecord[] {
  return [...events].sort((a, b) => Date.parse(b.event_time || '') - Date.parse(a.event_time || ''));
}

export function sortAlertsBySeverity(alerts: AlertItem[]): AlertItem[] {
  return [...alerts].sort((a, b) => toNumber(b.severity, 0) - toNumber(a.severity, 0));
}

export function filterUnreadAlerts(alerts: AlertItem[]): AlertItem[] {
  return alerts.filter((alert) => !alert.is_read);
}

export function mapShipmentDetail(raw: unknown): ShipmentDetailMapped {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const shipment = mapShipmentRecord(source.shipment);
  const events = Array.isArray(source.events)
    ? source.events.map(mapShipmentEvent).filter((item): item is ShipmentEventRecord => Boolean(item))
    : [];
  const alerts = Array.isArray(source.alerts)
    ? source.alerts.map(mapAlertRecord).filter((item): item is AlertItem => Boolean(item))
    : [];
  const activeRoute = mapActiveRoute(source.activeRoute || source.route);
  const alternatives = Array.isArray(source.alternatives)
    ? source.alternatives.map(mapAlternativeRoute).filter((item): item is AlternativeRoute => Boolean(item))
    : [];

  const mapped: ShipmentDetailMapped = {
    shipment,
    events: sortEventsNewestFirst(events),
    alerts: sortAlertsBySeverity(alerts),
    activeRoute,
    alternatives,
    source: source.source === 'requested' || source.source === 'auto' ? source.source : null,
    fetchedAt: toIsoOrNull(source.fetchedAt)
  };

  return mapped;
}
