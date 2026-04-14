import type { DisruptionSource, DisruptionStatus, DisruptionType } from '../types/disruption.ts';
import type { MapLayerKey, MapLayerState } from '../types/map.ts';
import type { RealtimeDomainEvent } from '../types/realtime.ts';
import type { RouteTriggerType } from '../types/route.ts';
import type { ShipmentEventSource, ShipmentEventType, ShipmentPriority, ShipmentStatus } from '../types/shipment.ts';

export const MAP_COLORS = {
  healthy: '#22c55e',
  warning: '#facc15',
  delayed: '#f43f5e',
  rerouted: '#0ea5e9',
  replacedRoute: '#94a3b8'
} as const;

export const POLLING_INTERVAL_MS = 15000;

export const DASHBOARD_REFRESH_INTERVAL_MS = 20000;

export const SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['pending', 'in_transit', 'delayed', 'delivered', 'cancelled'];

export const SHIPMENT_PRIORITIES: readonly ShipmentPriority[] = ['low', 'medium', 'high', 'critical'];

export const SHIPMENT_EVENT_TYPES: readonly ShipmentEventType[] = ['created', 'moved', 'delayed', 'rerouted', 'delivered'];

export const SHIPMENT_EVENT_SOURCES: readonly ShipmentEventSource[] = ['simulator', 'user', 'rule_engine', 'AI'];

export const ROUTE_TRIGGER_TYPES: readonly RouteTriggerType[] = ['initial', 'disruption', 'manual', 'AI'];

export const DISRUPTION_TYPES: readonly DisruptionType[] = ['weather', 'congestion', 'blockage', 'vehicle_issue'];

export const DISRUPTION_STATUSES: readonly DisruptionStatus[] = ['active', 'resolved'];

export const DISRUPTION_SOURCES: readonly DisruptionSource[] = ['rule_engine', 'AI', 'simulator', 'manual'];

export const MAP_LAYER_KEYS: readonly MapLayerKey[] = ['shipments', 'disruptions', 'routes', 'hubs'];

export const MAP_LAYER_LABELS: Readonly<Record<MapLayerKey, string>> = {
  shipments: 'Shipments',
  disruptions: 'Disruptions',
  routes: 'Routes',
  hubs: 'Hubs'
};

export const DEFAULT_MAP_LAYERS: MapLayerState = {
  shipments: true,
  disruptions: true,
  routes: true,
  hubs: true
};

export const SHIPMENT_DETAIL_REALTIME_EVENTS: readonly RealtimeDomainEvent[] = [
  'shipment:updated',
  'shipment:rerouted',
  'shipment:delayed',
  'shipment:delivered',
  'alert:new',
  'dashboard:refresh'
];
