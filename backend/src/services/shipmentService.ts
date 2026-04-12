import db from '../db/connection.js';
import {
  SHIPMENT_EVENT_SOURCES,
  SHIPMENT_EVENT_TYPES,
  SHIPMENT_PRIORITIES,
  SHIPMENT_STATUSES
} from '../utils/constants.js';
import { generateTrackingNumber } from '../utils/helpers.js';

type HttpError = Error & { statusCode: number };

type ShipmentPayload = {
  origin?: string;
  destination?: string;
  origin_node_id?: string | null;
  destination_node_id?: string | null;
  current_node_id?: string | null;
  carrier_id?: string | null;
  status?: string;
  priority?: string;
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
  tracking_number?: string;
  node_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ListShipmentArgs = {
  status?: string;
  carrierId?: string;
  limit: number;
  offset: number;
};

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message);
  (error as HttpError).statusCode = statusCode;
  return error as HttpError;
}

function mapStatusToEventType(status: string) {
  if (status === 'delayed') {
    return 'delayed';
  }

  if (status === 'delivered') {
    return 'delivered';
  }

  if (status === 'in_transit') {
    return 'moved';
  }

  return 'created';
}

function buildCurrentLocationRaw(longitude: number | null | undefined, latitude: number | null | undefined) {
  if (latitude == null || longitude == null) {
    return null;
  }

  return db.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [longitude, latitude]);
}

export async function createShipment(payload: ShipmentPayload) {
  if (!payload.origin || !payload.destination) {
    throw createHttpError(400, 'origin and destination are required');
  }

  if (payload.priority && !SHIPMENT_PRIORITIES.includes(payload.priority)) {
    throw createHttpError(400, `priority must be one of: ${SHIPMENT_PRIORITIES.join(', ')}`);
  }

  if (payload.status && !SHIPMENT_STATUSES.includes(payload.status)) {
    throw createHttpError(400, `status must be one of: ${SHIPMENT_STATUSES.join(', ')}`);
  }

  const trackingNumber = payload.tracking_number || generateTrackingNumber();
  const status = payload.status || 'pending';

  return db.transaction(async (trx) => {
    const insertData: Record<string, unknown> = {
      tracking_number: trackingNumber,
      origin: payload.origin,
      destination: payload.destination,
      origin_node_id: payload.origin_node_id || null,
      destination_node_id: payload.destination_node_id || null,
      current_node_id: payload.current_node_id || payload.origin_node_id || null,
      carrier_id: payload.carrier_id || null,
      status,
      priority: payload.priority || 'medium',
      cargo_type: payload.cargo_type || null,
      weight_kg: payload.weight_kg ?? null,
      planned_departure: payload.planned_departure || null,
      planned_arrival: payload.planned_arrival || null,
      current_latitude: payload.current_latitude ?? null,
      current_longitude: payload.current_longitude ?? null,
      progress_percentage: payload.progress_percentage ?? 0,
      current_eta: payload.current_eta || null,
      delay_probability: payload.delay_probability ?? null,
      predicted_delay_min: payload.predicted_delay_min ?? null,
      risk_level: payload.risk_level || 'low',
      updated_at: trx.fn.now()
    };

    const locationRaw = buildCurrentLocationRaw(payload.current_longitude ?? null, payload.current_latitude ?? null);
    if (locationRaw) {
      insertData.current_location = locationRaw;
    }

    const [shipment] = await trx('shipments').insert(insertData).returning('*');

    const eventType = mapStatusToEventType(status);
    if (SHIPMENT_EVENT_TYPES.includes(eventType)) {
      await trx('shipment_events').insert({
        shipment_id: shipment.id,
        event_type: eventType,
        node_id: shipment.current_node_id,
        latitude: shipment.current_latitude,
        longitude: shipment.current_longitude,
        description: payload.description || 'Shipment created',
        source: SHIPMENT_EVENT_SOURCES.includes(payload.source) ? payload.source : 'user',
        metadata_json: payload.metadata_json || {}
      });
    }

    return shipment;
  });
}

export async function listShipments({ status, carrierId, limit, offset }: ListShipmentArgs) {
  const query = db('shipments')
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  if (status) {
    query.where('status', status);
  }

  if (carrierId) {
    query.where('carrier_id', carrierId);
  }

  return query;
}

export async function getShipmentById(id: string) {
  return db('shipments').where({ id }).first();
}

export async function getShipmentByTrackingNumber(trackingNumber: string) {
  return db('shipments').where({ tracking_number: trackingNumber }).first();
}

export async function updateShipmentStatus(id: string, status: string, source = 'user') {
  if (!SHIPMENT_STATUSES.includes(status)) {
    throw createHttpError(400, `status must be one of: ${SHIPMENT_STATUSES.join(', ')}`);
  }

  return db.transaction(async (trx) => {
    const [shipment] = await trx('shipments')
      .where({ id })
      .update(
        {
          status,
          actual_arrival: status === 'delivered' ? trx.fn.now() : trx.raw('actual_arrival'),
          updated_at: trx.fn.now()
        },
        ['*']
      );

    if (!shipment) {
      return null;
    }

    const eventType = mapStatusToEventType(status);
    if (SHIPMENT_EVENT_TYPES.includes(eventType)) {
      await trx('shipment_events').insert({
        shipment_id: id,
        event_type: eventType,
        node_id: shipment.current_node_id,
        latitude: shipment.current_latitude,
        longitude: shipment.current_longitude,
        description: `Shipment status updated to ${status}`,
        source: SHIPMENT_EVENT_SOURCES.includes(source) ? source : 'user',
        metadata_json: { status }
      });
    }

    return shipment;
  });
}

export async function addShipmentLocation(id: string, payload: ShipmentPayload) {
  if (payload.latitude == null || payload.longitude == null) {
    throw createHttpError(400, 'latitude and longitude are required');
  }

  return db.transaction(async (trx) => {
    const [shipment] = await trx('shipments')
      .where({ id })
      .update(
        {
          current_latitude: payload.latitude,
          current_longitude: payload.longitude,
          current_node_id: payload.node_id || null,
          current_eta: payload.current_eta || trx.raw('current_eta'),
          current_location: buildCurrentLocationRaw(payload.longitude, payload.latitude),
          updated_at: trx.fn.now()
        },
        ['*']
      );

    if (!shipment) {
      return null;
    }

    await trx('shipment_events').insert({
      shipment_id: id,
      event_type: 'moved',
      node_id: payload.node_id || null,
      latitude: payload.latitude,
      longitude: payload.longitude,
      description: payload.description || 'Shipment location updated',
      source: SHIPMENT_EVENT_SOURCES.includes(payload.source) ? payload.source : 'user',
      metadata_json: payload.metadata_json || {}
    });

    return shipment;
  });
}

export async function getShipmentEvents(shipmentId: string) {
  return db('shipment_events')
    .select('*')
    .where({ shipment_id: shipmentId })
    .orderBy('event_time', 'asc');
}
