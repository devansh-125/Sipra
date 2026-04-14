import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type {
  CreateShipmentPayload,
  ListShipmentsQuery,
  Shipment,
  ShipmentEvent,
  ShipmentLocationPayload,
  ShipmentRecord,
  ShipmentStatus,
  UpdateShipmentStatusPayload
} from '../../types/shipment.ts';

export type {
  CreateShipmentPayload,
  ListShipmentsQuery,
  Shipment,
  ShipmentEvent,
  ShipmentEventSource,
  ShipmentEventType,
  ShipmentLocationPayload,
  ShipmentPriority,
  ShipmentRealtimeEventPayload,
  ShipmentRecord,
  ShipmentRiskLevel,
  ShipmentStatus,
  UpdateShipmentStatusPayload
} from '../../types/shipment.ts';

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
