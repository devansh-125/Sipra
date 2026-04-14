import db from '../db/connection.js';
import { generateDisruptionScenario, predictDelay } from './aiService.js';
import { simulateDisruption } from './disruptionService.js';
import { generateInitialRoute, rerouteShipment } from './routeService.js';
import { updateShipmentStatus } from './shipmentService.js';

type SeedOptions = {
	shipment_count?: number;
};

type GodModeOptions = {
	severity?: number;
};

const DEMO_NODE_PREFIX = 'DEMO:';
const DEMO_TRACKING_PREFIX = 'DEMO-';
const DEMO_CARRIER_CODE = 'DEMO-CARRIER';

function toNumber(value: unknown, fallback = 0): number {
	const parsed = Number.parseFloat(String(value));
	return Number.isNaN(parsed) ? fallback : parsed;
}

function hoursFromNowIso(hours: number): string {
	return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function minutesFromNowIso(minutes: number): string {
	return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

async function ensureDemoCarrier(trx: any) {
	const existing = await trx('carriers').where({ code: DEMO_CARRIER_CODE }).first();
	if (existing) {
		return existing;
	}

	const [carrier] = await trx('carriers')
		.insert({
			name: 'Demo Logistics Carrier',
			code: DEMO_CARRIER_CODE,
			reliability_score: 0.76,
			transport_modes: JSON.stringify(['road', 'rail', 'air'])
		})
		.returning('*');

	return carrier;
}

async function insertDemoNode(trx: any, node: Record<string, unknown>) {
	const [created] = await trx('network_nodes')
		.insert({
			...node,
			location: trx.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [node.longitude, node.latitude])
		})
		.returning('*');

	return created;
}

async function insertDemoEdge(trx: any, edge: Record<string, unknown>) {
	const payload = { ...edge };
	if (Array.isArray(payload.geometry_json)) {
		payload.geometry_json = JSON.stringify(payload.geometry_json);
	}
	const [created] = await trx('network_edges').insert(payload).returning('*');
	return created;
}

export async function resetDemoState() {
	return db.transaction(async (trx) => {
		const demoShipments = await trx('shipments').select('id').whereILike('tracking_number', `${DEMO_TRACKING_PREFIX}%`);
		const shipmentIds = demoShipments.map((row: any) => row.id);

		const demoDisruptions = await trx('disruptions').select('id').whereILike('title', `${DEMO_NODE_PREFIX}%`);
		const disruptionIds = demoDisruptions.map((row: any) => row.id);

		const demoNodes = await trx('network_nodes').select('id').whereILike('name', `${DEMO_NODE_PREFIX}%`);
		const nodeIds = demoNodes.map((row: any) => row.id);

		let demoEdgeIds: string[] = [];
		if (nodeIds.length > 0) {
			const edges = await trx('network_edges')
				.select('id')
				.whereIn('from_node_id', nodeIds)
				.orWhereIn('to_node_id', nodeIds);
			demoEdgeIds = edges.map((row: any) => row.id);
		}

		const alertsDeleted = await trx('alerts')
			.where((query: any) => {
				query.whereILike('title', `${DEMO_NODE_PREFIX}%`);
				if (shipmentIds.length > 0) {
					query.orWhereIn('shipment_id', shipmentIds);
				}
				if (disruptionIds.length > 0) {
					query.orWhereIn('disruption_id', disruptionIds);
				}
			})
			.del();

		const disruptionsDeleted = disruptionIds.length
			? await trx('disruptions').whereIn('id', disruptionIds).del()
			: await trx('disruptions').whereILike('title', `${DEMO_NODE_PREFIX}%`).del();

		const shipmentsDeleted = shipmentIds.length
			? await trx('shipments').whereIn('id', shipmentIds).del()
			: await trx('shipments').whereILike('tracking_number', `${DEMO_TRACKING_PREFIX}%`).del();

		const edgesDeleted = demoEdgeIds.length ? await trx('network_edges').whereIn('id', demoEdgeIds).del() : 0;
		const nodesDeleted = nodeIds.length ? await trx('network_nodes').whereIn('id', nodeIds).del() : 0;
		const carriersDeleted = await trx('carriers').whereILike('code', `${DEMO_CARRIER_CODE}%`).del();

		return {
			removed: {
				shipments: shipmentsDeleted,
				disruptions: disruptionsDeleted,
				alerts: alertsDeleted,
				nodes: nodesDeleted,
				edges: edgesDeleted,
				carriers: carriersDeleted
			}
		};
	});
}

export async function seedDemoData(options: SeedOptions = {}) {
	const seededCount = clampInt(toNumber(options.shipment_count, 3), 1, 6);

	await resetDemoState();

	return db.transaction(async (trx) => {
		const carrier = await ensureDemoCarrier(trx);

		const delhi = await insertDemoNode(trx, {
			name: `${DEMO_NODE_PREFIX} Delhi Warehouse`,
			type: 'warehouse',
			city: 'Delhi',
			state: 'Delhi',
			country: 'India',
			latitude: 28.6139,
			longitude: 77.209,
			capacity_score: 0.84,
			congestion_score: 0.34,
			is_active: true
		});

		const jaipur = await insertDemoNode(trx, {
			name: `${DEMO_NODE_PREFIX} Jaipur Hub`,
			type: 'hub',
			city: 'Jaipur',
			state: 'Rajasthan',
			country: 'India',
			latitude: 26.9124,
			longitude: 75.7873,
			capacity_score: 0.76,
			congestion_score: 0.28,
			is_active: true
		});

		const vadodara = await insertDemoNode(trx, {
			name: `${DEMO_NODE_PREFIX} Vadodara Checkpoint`,
			type: 'checkpoint',
			city: 'Vadodara',
			state: 'Gujarat',
			country: 'India',
			latitude: 22.3072,
			longitude: 73.1812,
			capacity_score: 0.66,
			congestion_score: 0.41,
			is_active: true
		});

		const mumbai = await insertDemoNode(trx, {
			name: `${DEMO_NODE_PREFIX} Mumbai Port`,
			type: 'port',
			city: 'Mumbai',
			state: 'Maharashtra',
			country: 'India',
			latitude: 19.076,
			longitude: 72.8777,
			capacity_score: 0.82,
			congestion_score: 0.46,
			is_active: true
		});

		await insertDemoEdge(trx, {
			from_node_id: delhi.id,
			to_node_id: jaipur.id,
			transport_mode: 'road',
			distance_km: 281,
			base_duration_min: 330,
			base_cost: 9800,
			base_risk_score: 0.28,
			current_risk_score: 0.35,
			is_blocked: false,
			is_active: true,
			geometry_json: [
				{ lat: 28.6139, lng: 77.209 },
				{ lat: 26.9124, lng: 75.7873 }
			],
			updated_at: trx.fn.now()
		});

		const railEdge = await insertDemoEdge(trx, {
			from_node_id: jaipur.id,
			to_node_id: mumbai.id,
			transport_mode: 'rail',
			distance_km: 1145,
			base_duration_min: 980,
			base_cost: 18100,
			base_risk_score: 0.23,
			current_risk_score: 0.31,
			is_blocked: false,
			is_active: true,
			geometry_json: [
				{ lat: 26.9124, lng: 75.7873 },
				{ lat: 19.076, lng: 72.8777 }
			],
			updated_at: trx.fn.now()
		});

		await insertDemoEdge(trx, {
			from_node_id: jaipur.id,
			to_node_id: vadodara.id,
			transport_mode: 'road',
			distance_km: 660,
			base_duration_min: 760,
			base_cost: 14600,
			base_risk_score: 0.26,
			current_risk_score: 0.34,
			is_blocked: false,
			is_active: true,
			geometry_json: [
				{ lat: 26.9124, lng: 75.7873 },
				{ lat: 22.3072, lng: 73.1812 }
			],
			updated_at: trx.fn.now()
		});

		await insertDemoEdge(trx, {
			from_node_id: vadodara.id,
			to_node_id: mumbai.id,
			transport_mode: 'road',
			distance_km: 430,
			base_duration_min: 520,
			base_cost: 11200,
			base_risk_score: 0.35,
			current_risk_score: 0.4,
			is_blocked: false,
			is_active: true,
			geometry_json: [
				{ lat: 22.3072, lng: 73.1812 },
				{ lat: 19.076, lng: 72.8777 }
			],
			updated_at: trx.fn.now()
		});

		await insertDemoEdge(trx, {
			from_node_id: delhi.id,
			to_node_id: mumbai.id,
			transport_mode: 'air',
			distance_km: 1150,
			base_duration_min: 190,
			base_cost: 32000,
			base_risk_score: 0.17,
			current_risk_score: 0.25,
			is_blocked: false,
			is_active: true,
			geometry_json: [
				{ lat: 28.6139, lng: 77.209 },
				{ lat: 19.076, lng: 72.8777 }
			],
			updated_at: trx.fn.now()
		});

		const shipmentPayloads = [
			{
				tracking_number: `${DEMO_TRACKING_PREFIX}1001`,
				origin: 'Delhi',
				destination: 'Mumbai',
				origin_node_id: delhi.id,
				destination_node_id: mumbai.id,
				current_node_id: delhi.id,
				carrier_id: carrier.id,
				status: 'in_transit',
				priority: 'critical',
				cargo_type: 'Electronics',
				weight_kg: 920,
				planned_departure: hoursFromNowIso(-5),
				planned_arrival: hoursFromNowIso(24),
				current_latitude: 27.52,
				current_longitude: 76.45,
				progress_percentage: 18,
				description: `${DEMO_NODE_PREFIX} Seeded shipment 1`
			},
			{
				tracking_number: `${DEMO_TRACKING_PREFIX}1002`,
				origin: 'Delhi',
				destination: 'Mumbai',
				origin_node_id: delhi.id,
				destination_node_id: mumbai.id,
				current_node_id: jaipur.id,
				carrier_id: carrier.id,
				status: 'in_transit',
				priority: 'high',
				cargo_type: 'Pharmaceuticals',
				weight_kg: 640,
				planned_departure: hoursFromNowIso(-8),
				planned_arrival: hoursFromNowIso(16),
				current_latitude: 26.91,
				current_longitude: 75.79,
				progress_percentage: 42,
				description: `${DEMO_NODE_PREFIX} Seeded shipment 2`
			},
			{
				tracking_number: `${DEMO_TRACKING_PREFIX}1003`,
				origin: 'Delhi',
				destination: 'Mumbai',
				origin_node_id: delhi.id,
				destination_node_id: mumbai.id,
				current_node_id: delhi.id,
				carrier_id: carrier.id,
				status: 'pending',
				priority: 'medium',
				cargo_type: 'Auto Parts',
				weight_kg: 1400,
				planned_departure: hoursFromNowIso(-1),
				planned_arrival: hoursFromNowIso(30),
				current_latitude: 28.61,
				current_longitude: 77.2,
				progress_percentage: 4,
				description: `${DEMO_NODE_PREFIX} Seeded shipment 3`
			},
			{
				tracking_number: `${DEMO_TRACKING_PREFIX}1004`,
				origin: 'Delhi',
				destination: 'Mumbai',
				origin_node_id: delhi.id,
				destination_node_id: mumbai.id,
				current_node_id: delhi.id,
				carrier_id: carrier.id,
				status: 'pending',
				priority: 'low',
				cargo_type: 'Consumer Goods',
				weight_kg: 1800,
				planned_departure: hoursFromNowIso(2),
				planned_arrival: hoursFromNowIso(40),
				current_latitude: 28.61,
				current_longitude: 77.2,
				progress_percentage: 0,
				description: `${DEMO_NODE_PREFIX} Seeded shipment 4`
			}
		].slice(0, seededCount);

		const seededShipments = [];

		for (const payload of shipmentPayloads) {
			const insertData: Record<string, unknown> = {
				tracking_number: payload.tracking_number,
				origin: payload.origin,
				destination: payload.destination,
				origin_node_id: payload.origin_node_id || null,
				destination_node_id: payload.destination_node_id || null,
				current_node_id: payload.current_node_id || payload.origin_node_id || null,
				carrier_id: payload.carrier_id || null,
				status: payload.status || 'pending',
				priority: payload.priority || 'medium',
				cargo_type: payload.cargo_type || null,
				weight_kg: payload.weight_kg ?? null,
				planned_departure: payload.planned_departure || null,
				planned_arrival: payload.planned_arrival || null,
				current_latitude: payload.current_latitude ?? null,
				current_longitude: payload.current_longitude ?? null,
				progress_percentage: payload.progress_percentage ?? 0,
				risk_level: 'low',
				updated_at: trx.fn.now()
			};

			if (payload.current_latitude != null && payload.current_longitude != null) {
				insertData.current_location = trx.raw(
					'ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography',
					[payload.current_longitude, payload.current_latitude]
				);
			}

			const [shipment] = await trx('shipments').insert(insertData).returning('*');

			await trx('shipment_events').insert({
				shipment_id: shipment.id,
				event_type: 'created',
				node_id: shipment.current_node_id,
				latitude: shipment.current_latitude,
				longitude: shipment.current_longitude,
				description: payload.description || 'Shipment created',
				source: 'simulator'
			});

			let routeResult: any = null;
			try {
				routeResult = await generateInitialRoute(shipment.id, { trigger_type: 'initial' });
			} catch { /* route generation may fail without full graph — skip */ }

			const riskScore = routeResult ? toNumber(routeResult.routePlan.risk_score, 0.3) : 0.3;
			const distanceKm = routeResult ? toNumber(routeResult.routePlan.total_distance_km, 800) : 800;
			const durationMin = routeResult ? toNumber(routeResult.routePlan.total_duration_min, 360) : 360;

			const delay = await predictDelay({
				shipment_id: shipment.id,
				distance_km: distanceKm,
				weather_risk_score: riskScore,
				traffic_risk_score: Math.min(1, riskScore + 0.08),
				congestion_score: Math.min(1, riskScore + 0.05),
				disruptions_count: 0,
				priority: shipment.priority,
				current_eta_minutes: Math.max(120, durationMin),
				use_remote: false
			});

			const [updatedShipment] = await trx('shipments')
				.where({ id: shipment.id })
				.update(
					{
						delay_probability: delay.delay_probability,
						predicted_delay_min: delay.predicted_delay_min,
						risk_level: delay.risk_level,
						current_eta: minutesFromNowIso(180 + delay.predicted_delay_min),
						updated_at: trx.fn.now()
					},
					['*']
				);

			seededShipments.push({
				shipment: updatedShipment,
				route_plan_id: routeResult?.routePlan?.id ?? null
			});
		}

		return {
			network: {
				nodes_created: 4,
				edges_created: 5,
				key_edge_id: railEdge.id
			},
			shipments: seededShipments,
			carrier_id: carrier.id
		};
	});
}

export async function triggerGodMode(options: GodModeOptions = {}) {
	const severity = clampInt(toNumber(options.severity, 10), 7, 10);

	const jaipur = await db('network_nodes').select('id').where({ name: `${DEMO_NODE_PREFIX} Jaipur Hub` }).first();
	const mumbai = await db('network_nodes').select('id').where({ name: `${DEMO_NODE_PREFIX} Mumbai Port` }).first();

	if (!jaipur || !mumbai) {
		throw Object.assign(new Error('Demo network not found. Call /api/demo/seed first.'), { statusCode: 400 });
	}

	const criticalEdge = await db('network_edges')
		.where({ from_node_id: jaipur.id, to_node_id: mumbai.id, transport_mode: 'rail' })
		.first();

	if (!criticalEdge) {
		throw Object.assign(new Error('Demo critical edge not found. Call /api/demo/seed first.'), { statusCode: 400 });
	}

	await db('network_edges').where({ id: criticalEdge.id }).update({
		is_blocked: true,
		current_risk_score: 0.95,
		updated_at: db.fn.now()
	});

	const scenario = await generateDisruptionScenario({
		type: 'blockage',
		severity,
		edge_id: criticalEdge.id,
		affected_radius_km: 140,
		persist: true,
		use_remote: false,
		title: `${DEMO_NODE_PREFIX} God Mode: Rail Corridor Shutdown`,
		description: `${DEMO_NODE_PREFIX} Major blockade triggered for cinematic demo impact.`
	});

	const liveShipments = await db('shipments')
		.select('*')
		.whereILike('tracking_number', `${DEMO_TRACKING_PREFIX}%`)
		.whereNotIn('status', ['delivered', 'cancelled'])
		.orderBy('created_at', 'asc');

	const impacted: any[] = [];
	let reroutedCount = 0;

	for (const shipment of liveShipments) {
		const delay = await predictDelay({
			shipment_id: shipment.id,
			distance_km: 1200,
			weather_risk_score: 0.82,
			traffic_risk_score: 0.9,
			congestion_score: 0.92,
			disruptions_count: 2,
			priority: shipment.priority,
			current_eta_minutes: 360,
			use_remote: false
		});

		await updateShipmentStatus(shipment.id, 'delayed', 'AI');
		await db('shipments').where({ id: shipment.id }).update({
			delay_probability: delay.delay_probability,
			predicted_delay_min: delay.predicted_delay_min,
			risk_level: delay.risk_level,
			current_eta: minutesFromNowIso(240 + delay.predicted_delay_min),
			updated_at: db.fn.now()
		});

		let rerouted = false;
		try {
			await rerouteShipment(shipment.id, {
				trigger_type: 'disruption',
				reason: `${DEMO_NODE_PREFIX} God Mode reroute due to blocked rail corridor`
			});
			rerouted = true;
			reroutedCount += 1;
		} catch {
			rerouted = false;
		}

		impacted.push({
			shipment_id: shipment.id,
			tracking_number: shipment.tracking_number,
			delay_probability: delay.delay_probability,
			predicted_delay_min: delay.predicted_delay_min,
			rerouted
		});
	}

	return {
		disruption: scenario.persisted_disruption,
		edge_id: criticalEdge.id,
		impacted_shipments: impacted,
		rerouted_count: reroutedCount
	};
}
