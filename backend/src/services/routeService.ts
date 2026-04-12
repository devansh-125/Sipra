import db from '../db/connection.js';
import { ROUTE_PLAN_TRIGGERS } from '../utils/constants.js';

type HttpError = Error & { statusCode: number };

type RouteTriggerPayload = {
  trigger_type?: string;
  reason?: string;
};

type NetworkNodeFilters = {
  type?: string;
  is_active?: boolean | null;
  city?: string;
  country?: string;
  limit?: number;
  offset?: number;
};

type NetworkEdgeFilters = {
  from_node_id?: string;
  to_node_id?: string;
  transport_mode?: string;
  is_blocked?: boolean | null;
  is_active?: boolean | null;
  limit?: number;
  offset?: number;
};

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message);
  (error as HttpError).statusCode = statusCode;
  return error as HttpError;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildWaypointsFromEdges(originNodeId: string, edges: any[]) {
  const waypoints = [originNodeId];
  for (const edge of edges) {
    waypoints.push(edge.to_node_id);
  }
  return waypoints;
}

function aggregateCandidate(edges: any[], originNodeId: string) {
  const totalDistanceKm = edges.reduce((sum, edge) => sum + toNumber(edge.distance_km), 0);
  const totalDurationMin = edges.reduce((sum, edge) => sum + toNumber(edge.base_duration_min), 0);
  const totalCost = edges.reduce((sum, edge) => sum + toNumber(edge.base_cost), 0);
  const averageRiskScore = edges.length
    ? edges.reduce((sum, edge) => sum + toNumber(edge.current_risk_score), 0) / edges.length
    : 0;

  return {
    edges,
    waypoints: buildWaypointsFromEdges(originNodeId, edges),
    totalDistanceKm,
    totalDurationMin,
    totalCost,
    averageRiskScore,
    candidateScore: totalDurationMin * 0.5 + totalDistanceKm * 0.3 + averageRiskScore * 100 * 0.2
  };
}

async function getShipmentOrThrow(shipmentId: string) {
  const shipment = await db('shipments').where({ id: shipmentId }).first();
  if (!shipment) {
    throw createHttpError(404, 'Shipment not found');
  }

  if (!shipment.origin_node_id || !shipment.destination_node_id) {
    throw createHttpError(400, 'Shipment must have origin_node_id and destination_node_id');
  }

  return shipment;
}

async function findDirectCandidates(originNodeId: string, destinationNodeId: string) {
  const directEdges = await db('network_edges')
    .select('*')
    .where({ from_node_id: originNodeId, to_node_id: destinationNodeId, is_active: true, is_blocked: false })
    .orderBy('current_risk_score', 'asc')
    .orderBy('base_duration_min', 'asc')
    .limit(5);

  return directEdges.map((edge) => aggregateCandidate([edge], originNodeId));
}

async function findTwoHopCandidates(originNodeId: string, destinationNodeId: string) {
  const rows = await db('network_edges as e1')
    .join('network_edges as e2', 'e1.to_node_id', 'e2.from_node_id')
    .select(
      'e1.id as e1_id',
      'e1.from_node_id as e1_from_node_id',
      'e1.to_node_id as e1_to_node_id',
      'e1.distance_km as e1_distance_km',
      'e1.base_duration_min as e1_base_duration_min',
      'e1.base_cost as e1_base_cost',
      'e1.current_risk_score as e1_current_risk_score',
      'e1.geometry_json as e1_geometry_json',
      'e2.id as e2_id',
      'e2.from_node_id as e2_from_node_id',
      'e2.to_node_id as e2_to_node_id',
      'e2.distance_km as e2_distance_km',
      'e2.base_duration_min as e2_base_duration_min',
      'e2.base_cost as e2_base_cost',
      'e2.current_risk_score as e2_current_risk_score',
      'e2.geometry_json as e2_geometry_json'
    )
    .where('e1.from_node_id', originNodeId)
    .andWhere('e2.to_node_id', destinationNodeId)
    .andWhere('e1.is_active', true)
    .andWhere('e2.is_active', true)
    .andWhere('e1.is_blocked', false)
    .andWhere('e2.is_blocked', false)
    .limit(10);

  return rows.map((row) => {
    const edge1 = {
      id: row.e1_id,
      from_node_id: row.e1_from_node_id,
      to_node_id: row.e1_to_node_id,
      distance_km: row.e1_distance_km,
      base_duration_min: row.e1_base_duration_min,
      base_cost: row.e1_base_cost,
      current_risk_score: row.e1_current_risk_score,
      geometry_json: row.e1_geometry_json
    };

    const edge2 = {
      id: row.e2_id,
      from_node_id: row.e2_from_node_id,
      to_node_id: row.e2_to_node_id,
      distance_km: row.e2_distance_km,
      base_duration_min: row.e2_base_duration_min,
      base_cost: row.e2_base_cost,
      current_risk_score: row.e2_current_risk_score,
      geometry_json: row.e2_geometry_json
    };

    return aggregateCandidate([edge1, edge2], originNodeId);
  });
}

async function findCandidateRoutes(originNodeId: string, destinationNodeId: string) {
  const directCandidates = await findDirectCandidates(originNodeId, destinationNodeId);
  const twoHopCandidates = await findTwoHopCandidates(originNodeId, destinationNodeId);

  return [...directCandidates, ...twoHopCandidates]
    .sort((a, b) => a.candidateScore - b.candidateScore)
    .slice(0, 5);
}

async function getNextRoutePlanVersion(trx: any, shipmentId: string) {
  const result = await trx('route_plans').where({ shipment_id: shipmentId }).max({ maxVersion: 'version_no' }).first();
  return (result?.maxVersion || 0) + 1;
}

function mapEdgeToRouteSegment(edge: any, routePlanId: string, index: number) {
  const normalizedRisk = toNumber(edge.current_risk_score, 0);

  return {
    route_plan_id: routePlanId,
    sequence_no: index + 1,
    edge_id: edge.id,
    from_node_id: edge.from_node_id,
    to_node_id: edge.to_node_id,
    planned_distance_km: edge.distance_km,
    planned_duration_min: edge.base_duration_min,
    weather_risk: Math.min(1, normalizedRisk * 0.35),
    congestion_risk: Math.min(1, normalizedRisk * 0.45),
    disruption_risk: Math.min(1, normalizedRisk * 0.2),
    final_score: normalizedRisk,
    geometry_json: edge.geometry_json || []
  };
}

async function persistRoutePlanForCandidate(trx: any, shipment: any, candidate: any, triggerType: string) {
  const versionNo = await getNextRoutePlanVersion(trx, shipment.id);

  await trx('route_plans')
    .where({ shipment_id: shipment.id, is_active: true })
    .update({ is_active: false, status: 'replaced' });

  const [routePlan] = await trx('route_plans')
    .insert({
      shipment_id: shipment.id,
      version_no: versionNo,
      is_active: true,
      status: 'active',
      trigger_type: triggerType,
      total_distance_km: candidate.totalDistanceKm,
      total_duration_min: Math.round(candidate.totalDurationMin),
      risk_score: Math.min(1, candidate.averageRiskScore),
      comparison_summary_json: {
        candidate_score: candidate.candidateScore,
        generated_by: 'node_route_service'
      }
    })
    .returning('*');

  const segments = candidate.edges.map((edge, index) => mapEdgeToRouteSegment(edge, routePlan.id, index));
  if (segments.length > 0) {
    await trx('route_segments').insert(segments);
  }

  const [routeRecord] = await trx('routes')
    .insert({
      shipment_id: shipment.id,
      waypoints: candidate.waypoints,
      distance_km: candidate.totalDistanceKm,
      estimated_time_hours: candidate.totalDurationMin / 60,
      weather_risk_score: Math.min(1, candidate.averageRiskScore * 0.6),
      traffic_risk_score: Math.min(1, candidate.averageRiskScore * 0.4)
    })
    .returning('*');

  await trx('shipments')
    .where({ id: shipment.id })
    .update({
      active_route_plan_id: routePlan.id,
      status: shipment.status === 'pending' ? 'in_transit' : shipment.status,
      updated_at: trx.fn.now()
    });

  const [finalRoutePlan] = await trx('route_plans')
    .where({ id: routePlan.id })
    .update(
      {
        comparison_summary_json: {
          ...routePlan.comparison_summary_json,
          linked_route_id: routeRecord.id,
          waypoints: candidate.waypoints
        }
      },
      ['*']
    );

  return {
    routePlan: finalRoutePlan,
    route: routeRecord,
    segments
  };
}

export async function generateInitialRoute(shipmentId: string, payload: RouteTriggerPayload = {}) {
  const shipment = await getShipmentOrThrow(shipmentId);

  const triggerType = ROUTE_PLAN_TRIGGERS.includes(payload.trigger_type) ? payload.trigger_type : 'initial';
  const candidates = await findCandidateRoutes(shipment.origin_node_id, shipment.destination_node_id);

  if (candidates.length === 0) {
    throw createHttpError(404, 'No route candidates found for this shipment');
  }

  return db.transaction(async (trx) => {
    const planResult = await persistRoutePlanForCandidate(trx, shipment, candidates[0], triggerType);

    await trx('shipment_events').insert({
      shipment_id: shipment.id,
      event_type: 'rerouted',
      node_id: shipment.current_node_id,
      description: triggerType === 'initial' ? 'Initial route generated' : `Route generated (${triggerType})`,
      source: 'rule_engine',
      metadata_json: {
        route_plan_id: planResult.routePlan.id,
        trigger_type: triggerType
      }
    });

    return planResult;
  });
}

export async function getActiveRouteForShipment(shipmentId: string) {
  await getShipmentOrThrow(shipmentId);

  const routePlan = await db('route_plans')
    .select('*')
    .where({ shipment_id: shipmentId, is_active: true })
    .orderBy('version_no', 'desc')
    .first();

  if (!routePlan) {
    return null;
  }

  const segments = await db('route_segments')
    .select('*')
    .where({ route_plan_id: routePlan.id })
    .orderBy('sequence_no', 'asc');

  return { routePlan, segments };
}

export async function getTopAlternativeRoutes(shipmentId: string, limit = 3) {
  await getShipmentOrThrow(shipmentId);

  const existing = await db('alternate_routes')
    .select('*')
    .where({ shipment_id: shipmentId })
    .orderBy('recommendation_score', 'desc')
    .limit(limit);

  if (existing.length > 0) {
    return existing;
  }

  const activeRoute = await getActiveRouteForShipment(shipmentId);
  const shipment = await db('shipments').where({ id: shipmentId }).first();
  const candidates = await findCandidateRoutes(shipment.origin_node_id, shipment.destination_node_id);

  if (!activeRoute || candidates.length === 0) {
    return [];
  }

  const activeSignature = activeRoute.segments.map((segment) => segment.edge_id).join('>');
  const latestPrimaryRoute = await db('routes')
    .select('id')
    .where({ shipment_id: shipmentId })
    .orderBy('created_at', 'desc')
    .first();

  const activeDuration = toNumber(activeRoute.routePlan.total_duration_min, 0);
  const activeDistance = toNumber(activeRoute.routePlan.total_distance_km, 0);

  const insertPayload = candidates
    .filter((candidate) => candidate.edges.map((edge) => edge.id).join('>') !== activeSignature)
    .slice(0, limit)
    .map((candidate) => ({
      shipment_id: shipmentId,
      original_route_id: latestPrimaryRoute?.id || null,
      alternative_waypoints: candidate.waypoints,
      time_difference: candidate.totalDurationMin - activeDuration,
      cost_difference: candidate.totalDistanceKm - activeDistance,
      recommendation_score: Math.max(0, Math.min(1, 1 - candidate.candidateScore / 1000))
    }));

  if (insertPayload.length === 0) {
    return [];
  }

  await db('alternate_routes').insert(insertPayload);

  return db('alternate_routes')
    .select('*')
    .where({ shipment_id: shipmentId })
    .orderBy('recommendation_score', 'desc')
    .limit(limit);
}

export async function rerouteShipment(shipmentId: string, payload: RouteTriggerPayload = {}) {
  const shipment = await getShipmentOrThrow(shipmentId);
  const activeRoute = await getActiveRouteForShipment(shipmentId);

  if (!activeRoute) {
    throw createHttpError(404, 'No active route found. Generate an initial route first.');
  }

  const triggerType = ROUTE_PLAN_TRIGGERS.includes(payload.trigger_type) ? payload.trigger_type : 'manual';
  const activeSignature = activeRoute.segments.map((segment) => segment.edge_id).join('>');

  const candidates = await findCandidateRoutes(shipment.origin_node_id, shipment.destination_node_id);
  const replacement = candidates.find((candidate) => candidate.edges.map((edge) => edge.id).join('>') !== activeSignature);

  if (!replacement) {
    throw createHttpError(404, 'No alternate route available for reroute');
  }

  return db.transaction(async (trx) => {
    const rerouteResult = await persistRoutePlanForCandidate(trx, shipment, replacement, triggerType);

    await trx('shipment_events').insert({
      shipment_id: shipment.id,
      event_type: 'rerouted',
      node_id: shipment.current_node_id,
      description: payload.reason || 'Shipment rerouted',
      source: 'user',
      metadata_json: {
        route_plan_id: rerouteResult.routePlan.id,
        trigger_type: triggerType
      }
    });

    return rerouteResult;
  });
}

export async function listNetworkNodes(filters: NetworkNodeFilters = {}) {
  const query = db('network_nodes').select('*').orderBy('name', 'asc');

  if (filters.type) {
    query.where('type', filters.type);
  }

  if (filters.is_active != null) {
    query.where('is_active', filters.is_active);
  }

  if (filters.city) {
    query.whereILike('city', `%${filters.city}%`);
  }

  if (filters.country) {
    query.whereILike('country', `%${filters.country}%`);
  }

  if (filters.limit) {
    query.limit(filters.limit);
  }

  if (filters.offset) {
    query.offset(filters.offset);
  }

  return query;
}

export async function listNetworkEdges(filters: NetworkEdgeFilters = {}) {
  const query = db('network_edges').select('*').orderBy('created_at', 'desc');

  if (filters.from_node_id) {
    query.where('from_node_id', filters.from_node_id);
  }

  if (filters.to_node_id) {
    query.where('to_node_id', filters.to_node_id);
  }

  if (filters.transport_mode) {
    query.where('transport_mode', filters.transport_mode);
  }

  if (filters.is_blocked != null) {
    query.where('is_blocked', filters.is_blocked);
  }

  if (filters.is_active != null) {
    query.where('is_active', filters.is_active);
  }

  if (filters.limit) {
    query.limit(filters.limit);
  }

  if (filters.offset) {
    query.offset(filters.offset);
  }

  return query;
}
