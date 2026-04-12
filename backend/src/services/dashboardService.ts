import db from '../db/connection.js';

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function getDashboardSummary() {
  const shipmentStatusRows = await db('shipments')
    .select('status')
    .count<{ status: string; count: string }[]>({ count: '*' })
    .groupBy('status');

  const totalsByStatus = Object.fromEntries(
    shipmentStatusRows.map((row) => [row.status, toInt(row.count, 0)])
  ) as Record<string, number>;

  const [activeDisruptionsRow, openAlertsRow, predictionsRow] = await Promise.all([
    db('disruptions').where({ status: 'active' }).count({ count: '*' }).first(),
    db('alerts').whereNull('resolved_at').count({ count: '*' }).first(),
    db('delay_predictions')
      .select(db.raw('AVG(predicted_delay_min) as avg_predicted_delay_min'))
      .select(db.raw('AVG(delay_probability) as avg_delay_probability'))
      .first()
  ]);
  const predictionAverages = predictionsRow as
    | { avg_predicted_delay_min?: number | string | null; avg_delay_probability?: number | string | null }
    | undefined;

  const totalShipments = Object.values(totalsByStatus).reduce((sum, count) => sum + count, 0);

  return {
    shipments: {
      total: totalShipments,
      pending: totalsByStatus.pending || 0,
      in_transit: totalsByStatus.in_transit || 0,
      delayed: totalsByStatus.delayed || 0,
      delivered: totalsByStatus.delivered || 0,
      cancelled: totalsByStatus.cancelled || 0
    },
    disruptions: {
      active: toInt(activeDisruptionsRow?.count, 0)
    },
    alerts: {
      open: toInt(openAlertsRow?.count, 0)
    },
    delays: {
      avg_predicted_delay_min: Number(toNumber(predictionAverages?.avg_predicted_delay_min, 0).toFixed(2)),
      avg_delay_probability: Number(toNumber(predictionAverages?.avg_delay_probability, 0).toFixed(4))
    }
  };
}

export async function getDelayTrends(days: number) {
  const safeDays = Math.max(1, Math.min(days, 90));

  const rows = await db('shipments')
    .select(db.raw("date_trunc('day', created_at)::date as day"))
    .select(db.raw("COUNT(*) FILTER (WHERE status = 'delayed')::int as delayed_count"))
    .select(db.raw("COUNT(*) FILTER (WHERE status = 'delivered')::int as delivered_count"))
    .select(db.raw('AVG(predicted_delay_min) as avg_predicted_delay_min'))
    .where('created_at', '>=', db.raw("NOW() - (? * INTERVAL '1 day')", [safeDays]))
    .groupByRaw("date_trunc('day', created_at)::date")
    .orderBy('day', 'asc');

  return rows.map((row: any) => ({
    day: row.day,
    delayed_count: toInt(row.delayed_count, 0),
    delivered_count: toInt(row.delivered_count, 0),
    avg_predicted_delay_min: Number(toNumber(row.avg_predicted_delay_min, 0).toFixed(2))
  }));
}

export async function getBottlenecks(limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 50));

  const [nodeBottlenecks, edgeBottlenecks] = await Promise.all([
    db('network_nodes as n')
      .leftJoin('shipment_events as se', 'n.id', 'se.node_id')
      .select('n.id', 'n.name', 'n.city', 'n.country', 'n.type', 'n.capacity_score', 'n.congestion_score')
      .count({ event_count: 'se.id' })
      .groupBy('n.id', 'n.name', 'n.city', 'n.country', 'n.type', 'n.capacity_score', 'n.congestion_score')
      .orderBy('n.congestion_score', 'desc')
      .orderBy('event_count', 'desc')
      .limit(safeLimit),
    db('network_edges as e')
      .leftJoin('route_segments as rs', 'e.id', 'rs.edge_id')
      .select('e.id', 'e.from_node_id', 'e.to_node_id', 'e.transport_mode', 'e.current_risk_score', 'e.is_blocked')
      .count({ segment_count: 'rs.id' })
      .groupBy('e.id', 'e.from_node_id', 'e.to_node_id', 'e.transport_mode', 'e.current_risk_score', 'e.is_blocked')
      .orderBy('e.current_risk_score', 'desc')
      .orderBy('segment_count', 'desc')
      .limit(safeLimit)
  ]);

  return {
    nodes: nodeBottlenecks.map((row: any) => ({
      ...row,
      event_count: toInt(row.event_count, 0)
    })),
    edges: edgeBottlenecks.map((row: any) => ({
      ...row,
      segment_count: toInt(row.segment_count, 0)
    }))
  };
}

export async function getMapData(limit: number) {
  const safeLimit = Math.max(10, Math.min(limit, 1000));

  const [shipments, disruptions, nodes] = await Promise.all([
    db('shipments')
      .select('id', 'tracking_number', 'status', 'priority')
      .select(db.raw('ST_Y(current_location::geometry) as latitude'))
      .select(db.raw('ST_X(current_location::geometry) as longitude'))
      .whereNotNull('current_location')
      .orderBy('updated_at', 'desc')
      .limit(safeLimit),
    db('disruptions')
      .select('id', 'type', 'severity', 'status', 'title', 'starts_at', 'ends_at')
      .select(db.raw('ST_Y(location::geometry) as latitude'))
      .select(db.raw('ST_X(location::geometry) as longitude'))
      .whereNotNull('location')
      .orderBy('starts_at', 'desc')
      .limit(safeLimit),
    db('network_nodes')
      .select('id', 'name', 'type', 'city', 'country', 'latitude', 'longitude')
      .where({ is_active: true })
      .orderBy('name', 'asc')
      .limit(safeLimit)
  ]);

  return {
    shipments,
    disruptions,
    nodes
  };
}

export async function getRiskDistribution() {
  const [shipmentRiskRows, disruptionSeverityRows, routeRiskRows] = await Promise.all([
    db('shipments').select('risk_level').count({ count: '*' }).groupBy('risk_level'),
    db('disruptions')
      .select(
        db.raw(`CASE
          WHEN severity BETWEEN 1 AND 3 THEN 'low'
          WHEN severity BETWEEN 4 AND 7 THEN 'medium'
          ELSE 'high'
        END as severity_bucket`)
      )
      .count({ count: '*' })
      .groupBy('severity_bucket'),
    db('route_plans')
      .select(
        db.raw(`CASE
          WHEN risk_score < 0.33 THEN 'low'
          WHEN risk_score < 0.66 THEN 'medium'
          ELSE 'high'
        END as risk_bucket`)
      )
      .count({ count: '*' })
      .groupBy('risk_bucket')
  ]);

  const shipments = shipmentRiskRows.map((row: any) => ({
    risk_level: row.risk_level || 'unknown',
    count: toInt(row.count, 0)
  }));

  const disruptions = disruptionSeverityRows.map((row: any) => ({
    severity_bucket: row.severity_bucket || 'unknown',
    count: toInt(row.count, 0)
  }));

  const routes = routeRiskRows.map((row: any) => ({
    risk_bucket: row.risk_bucket || 'unknown',
    count: toInt(row.count, 0)
  }));

  return {
    shipments,
    disruptions,
    routes
  };
}
