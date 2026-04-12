import db from '../db/connection.js';
import { DISRUPTION_SOURCES, DISRUPTION_TYPES } from '../utils/constants.js';

type HttpError = Error & { statusCode: number };

type ListDisruptionFilters = {
  status?: string;
  type?: string;
  source?: string;
  node_id?: string;
  edge_id?: string;
  severity_gte?: number;
  severity_lte?: number;
  limit: number;
  offset: number;
};

type SimulatePayload = {
  type?: string;
  severity?: number;
  node_id?: string;
  edge_id?: string;
  latitude?: number;
  longitude?: number;
  affected_radius_km?: number;
  starts_at?: string;
  ends_at?: string;
  title?: string;
  description?: string;
  source?: string;
};

type DetectPayload = {
  threshold?: number;
  limit?: number;
};

type ResolvePayload = {
  ends_at?: string;
  resolution_note?: string;
};

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message);
  (error as HttpError).statusCode = statusCode;
  return error as HttpError;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampSeverity(rawSeverity: number): number {
  return Math.max(1, Math.min(10, Math.round(rawSeverity)));
}

async function resolveLocationPoint(payload: SimulatePayload) {
  if (payload.latitude != null && payload.longitude != null) {
    return db.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [payload.longitude, payload.latitude]);
  }

  if (payload.node_id) {
    const node = await db('network_nodes')
      .select('latitude', 'longitude')
      .where({ id: payload.node_id })
      .first();

    if (!node) {
      throw createHttpError(400, 'node_id is invalid');
    }

    return db.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [node.longitude, node.latitude]);
  }

  if (payload.edge_id) {
    const edgeRow = await db('network_edges as e')
      .join('network_nodes as from_node', 'e.from_node_id', 'from_node.id')
      .join('network_nodes as to_node', 'e.to_node_id', 'to_node.id')
      .where('e.id', payload.edge_id)
      .select(
        db.raw('((from_node.latitude + to_node.latitude) / 2.0) as latitude'),
        db.raw('((from_node.longitude + to_node.longitude) / 2.0) as longitude')
      )
      .first();
    const edge = edgeRow as unknown as { latitude: number; longitude: number } | undefined;

    if (!edge) {
      throw createHttpError(400, 'edge_id is invalid');
    }

    return db.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [edge.longitude, edge.latitude]);
  }

  throw createHttpError(400, 'Provide latitude/longitude, node_id, or edge_id to determine disruption location');
}

async function createDisruptionAlert(disruption: any, trx: any) {
  const title = disruption.title || 'Disruption detected';
  const message = disruption.description || `${disruption.type} disruption active with severity ${disruption.severity}`;

  await trx('alerts').insert({
    shipment_id: null,
    disruption_id: disruption.id,
    alert_type: 'disruption_new',
    severity: disruption.severity,
    title,
    message,
    is_read: false
  });
}

export async function listDisruptions(filters: ListDisruptionFilters) {
  const query = db('disruptions').select('*').orderBy('starts_at', 'desc').limit(filters.limit).offset(filters.offset);

  if (filters.status) {
    query.where('status', filters.status);
  }

  if (filters.type) {
    query.where('type', filters.type);
  }

  if (filters.source) {
    query.where('source', filters.source);
  }

  if (filters.node_id) {
    query.where('node_id', filters.node_id);
  }

  if (filters.edge_id) {
    query.where('edge_id', filters.edge_id);
  }

  if (typeof filters.severity_gte === 'number') {
    query.where('severity', '>=', filters.severity_gte);
  }

  if (typeof filters.severity_lte === 'number') {
    query.where('severity', '<=', filters.severity_lte);
  }

  return query;
}

export async function simulateDisruption(payload: SimulatePayload = {}) {
  const type = payload.type && DISRUPTION_TYPES.includes(payload.type) ? payload.type : 'weather';
  const source = payload.source && DISRUPTION_SOURCES.includes(payload.source) ? payload.source : 'simulator';
  const severity = clampSeverity(toNumber(payload.severity, 6));
  const location = await resolveLocationPoint(payload);

  return db.transaction(async (trx) => {
    const [disruption] = await trx('disruptions')
      .insert({
        type,
        severity,
        status: 'active',
        location,
        node_id: payload.node_id || null,
        edge_id: payload.edge_id || null,
        affected_radius_km: Math.max(0, toNumber(payload.affected_radius_km, 25)),
        starts_at: payload.starts_at || trx.fn.now(),
        ends_at: payload.ends_at || null,
        title: payload.title || 'Simulated disruption',
        description: payload.description || `Simulated ${type} disruption for testing`,
        source,
        updated_at: trx.fn.now()
      })
      .returning('*');

    await createDisruptionAlert(disruption, trx);
    return disruption;
  });
}

export async function detectDisruptions(payload: DetectPayload = {}) {
  const threshold = Math.max(0, Math.min(1, toNumber(payload.threshold, 0.8)));
  const limit = Math.max(1, Math.min(20, Number.parseInt(String(payload.limit ?? 5), 10) || 5));

  const riskyEdges = await db('network_edges as e')
    .join('network_nodes as from_node', 'e.from_node_id', 'from_node.id')
    .join('network_nodes as to_node', 'e.to_node_id', 'to_node.id')
    .select(
      'e.id',
      'e.from_node_id',
      'e.to_node_id',
      'e.current_risk_score',
      db.raw('((from_node.latitude + to_node.latitude) / 2.0) as latitude'),
      db.raw('((from_node.longitude + to_node.longitude) / 2.0) as longitude')
    )
    .where('e.is_active', true)
    .andWhere('e.is_blocked', false)
    .andWhere('e.current_risk_score', '>=', threshold)
    .orderBy('e.current_risk_score', 'desc')
    .limit(limit);

  if (riskyEdges.length === 0) {
    return {
      threshold,
      inspected_edges: 0,
      created_count: 0,
      disruptions: []
    };
  }

  return db.transaction(async (trx) => {
    const created: any[] = [];

    for (const edge of riskyEdges) {
      const activeExisting = await trx('disruptions')
        .where({ edge_id: edge.id, status: 'active' })
        .first();

      if (activeExisting) {
        continue;
      }

      const [disruption] = await trx('disruptions')
        .insert({
          type: 'congestion',
          severity: clampSeverity(toNumber(edge.current_risk_score, 0) * 10),
          status: 'active',
          location: trx.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [edge.longitude, edge.latitude]),
          node_id: null,
          edge_id: edge.id,
          affected_radius_km: 20,
          starts_at: trx.fn.now(),
          ends_at: null,
          title: 'Auto-detected edge risk',
          description: `Detected high risk score ${toNumber(edge.current_risk_score, 0).toFixed(2)} on edge ${edge.id}`,
          source: 'rule_engine',
          updated_at: trx.fn.now()
        })
        .returning('*');

      await createDisruptionAlert(disruption, trx);
      created.push(disruption);
    }

    return {
      threshold,
      inspected_edges: riskyEdges.length,
      created_count: created.length,
      disruptions: created
    };
  });
}

export async function resolveDisruption(disruptionId: string, payload: ResolvePayload = {}) {
  const [resolved] = await db('disruptions')
    .where({ id: disruptionId })
    .update(
      {
        status: 'resolved',
        ends_at: payload.ends_at || db.fn.now(),
        description: payload.resolution_note
          ? db.raw("COALESCE(description, '') || ?", [`\nResolution: ${payload.resolution_note}`])
          : db.raw('description'),
        updated_at: db.fn.now()
      },
      ['*']
    );

  if (!resolved) {
    return null;
  }

  await db('alerts')
    .where({ disruption_id: disruptionId })
    .andWhere('resolved_at', null)
    .update({ resolved_at: db.fn.now() });

  return resolved;
}
