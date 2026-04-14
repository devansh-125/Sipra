import type { ApiPaginationQuery } from './api.ts';

export type ShipmentStatus = 'pending' | 'in_transit' | 'delayed' | 'delivered' | 'cancelled';

export type ShipmentPriority = 'low' | 'medium' | 'high' | 'critical';

export type ShipmentRiskLevel = 'low' | 'medium' | 'high' | 'critical' | string;

export type ShipmentEventType = 'created' | 'moved' | 'delayed' | 'rerouted' | 'delivered' | string;

export type ShipmentEventSource = 'simulator' | 'user' | 'rule_engine' | 'AI' | string;

export type Shipment = {
  id: string;
  tracking_number: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  current_eta?: string | null;
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: ShipmentRiskLevel | null;
};

export type ShipmentRecord = Shipment & {
  origin_node_id?: string | null;
  destination_node_id?: string | null;
  current_node_id?: string | null;
  carrier_id?: string | null;
  priority?: ShipmentPriority | string;
  cargo_type?: string | null;
  weight_kg?: number | null;
  planned_departure?: string | null;
  planned_arrival?: string | null;
  actual_departure?: string | null;
  actual_arrival?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  progress_percentage?: number | null;
  updated_at?: string | null;
};

export type ShipmentEvent = {
  id: string;
  shipment_id: string;
  event_type: ShipmentEventType;
  node_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  event_time: string;
  source?: ShipmentEventSource;
  metadata_json?: Record<string, unknown> | null;
};

export type ListShipmentsQuery = ApiPaginationQuery & {
  status?: ShipmentStatus;
  carrier_id?: string;
};

export type CreateShipmentPayload = {
  tracking_number?: string;
  origin: string;
  destination: string;
  origin_node_id?: string | null;
  destination_node_id?: string | null;
  current_node_id?: string | null;
  carrier_id?: string | null;
  status?: ShipmentStatus;
  priority?: ShipmentPriority;
  cargo_type?: string | null;
  weight_kg?: number | null;
  planned_departure?: string | null;
  planned_arrival?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  progress_percentage?: number;
  current_eta?: string | null;
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: ShipmentRiskLevel;
  source?: ShipmentEventSource;
  description?: string;
  metadata_json?: Record<string, unknown>;
};

export type UpdateShipmentStatusPayload = {
  status: ShipmentStatus;
  source?: ShipmentEventSource;
};

export type ShipmentLocationPayload = {
  latitude: number;
  longitude: number;
  node_id?: string | null;
  current_eta?: string | null;
  source?: ShipmentEventSource;
  description?: string;
  metadata_json?: Record<string, unknown>;
};

export type ShipmentRealtimeEventPayload = {
  shipmentId?: string;
  shipment_id?: string;
  trackingNumber?: string;
  status?: ShipmentStatus | string;
  latitude?: number;
  longitude?: number;
  routePlanId?: string;
  reason?: string;
  [key: string]: unknown;
};
