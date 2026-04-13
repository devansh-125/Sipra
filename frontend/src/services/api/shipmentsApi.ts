import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Shipment, ShipmentStatus } from '../../types/shipment.ts';

export type ShipmentRecord = Shipment & {
  origin_node_id?: string | null;
  destination_node_id?: string | null;
  current_node_id?: string | null;
  carrier_id?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | string;
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
  event_type: 'created' | 'moved' | 'delayed' | 'rerouted' | 'delivered' | string;
  node_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  event_time: string;
  source?: 'simulator' | 'user' | 'rule_engine' | 'AI' | string;
  metadata_json?: Record<string, unknown> | null;
};

export type ListShipmentsQuery = {
  status?: ShipmentStatus;
  carrier_id?: string;
  limit?: number;
  offset?: number;
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
  priority?: 'low' | 'medium' | 'high' | 'critical';
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
  risk_level?: string;
  source?: string;
  description?: string;
  metadata_json?: Record<string, unknown>;
};

export type UpdateShipmentStatusPayload = {
  status: ShipmentStatus;
  source?: string;
};

export type ShipmentLocationPayload = {
  latitude: number;
  longitude: number;
  node_id?: string | null;
  current_eta?: string | null;
  source?: string;
  description?: string;
  metadata_json?: Record<string, unknown>;
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

function sanitizeListQuery(query?: ListShipmentsQuery): ListShipmentsQuery | undefined {
  if (!query) {
    return undefined;
  }

  const limit = toInt(query.limit);
  const offset = toInt(query.offset);

  return {
    status: query.status,
    carrier_id: toCleanString(query.carrier_id),
    limit: limit == null ? undefined : clamp(limit, 1, 1000),
    offset: offset == null ? undefined : Math.max(0, offset)
  };
}

function sanitizeLocationPayload(payload: ShipmentLocationPayload): ShipmentLocationPayload {
  return {
    ...payload,
    node_id: payload.node_id || null,
    current_eta: payload.current_eta || null,
    source: toCleanString(payload.source),
    description: toCleanString(payload.description)
  };
}

export const shipmentsApi = {
  list: (query?: ListShipmentsQuery) =>
    apiRequest<ApiResponse<ShipmentRecord[]>>('/api/shipments', {
      query: sanitizeListQuery(query)
    }),
  create: (payload: CreateShipmentPayload) =>
    apiRequest<ApiResponse<ShipmentRecord>>('/api/shipments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getById: (shipmentId: string) =>
    apiRequest<ApiResponse<ShipmentRecord>>(`/api/shipments/${encodeURIComponent(shipmentId)}`),
  getByTrackingNumber: (trackingNumber: string) =>
    apiRequest<ApiResponse<ShipmentRecord>>(`/api/shipments/track/${encodeURIComponent(trackingNumber)}`),
  getEvents: (shipmentId: string) =>
    apiRequest<ApiResponse<ShipmentEvent[]>>(`/api/shipments/${encodeURIComponent(shipmentId)}/events`),
  updateStatus: (shipmentId: string, statusOrPayload: ShipmentStatus | UpdateShipmentStatusPayload) => {
    const payload =
      typeof statusOrPayload === 'string'
        ? { status: statusOrPayload }
        : statusOrPayload;

    return apiRequest<ApiResponse<ShipmentRecord>>(`/api/shipments/${encodeURIComponent(shipmentId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },
  addLocation: (shipmentId: string, payload: ShipmentLocationPayload) =>
    apiRequest<ApiResponse<ShipmentRecord>>(`/api/shipments/${encodeURIComponent(shipmentId)}/location`, {
      method: 'POST',
      body: JSON.stringify(sanitizeLocationPayload(payload))
    })
};

export const shipmentApi = shipmentsApi;
