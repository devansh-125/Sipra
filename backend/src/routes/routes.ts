import express from 'express';
import {
	generateInitialRoute,
	getActiveRouteForShipment,
	getTopAlternativeRoutes,
	listNetworkEdges,
	listNetworkNodes,
	rerouteShipment
} from '../services/routeService.js';
import { parsePagination } from '../utils/helpers.js';

const router = express.Router();

function getQueryString(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	if (Array.isArray(value) && typeof value[0] === 'string') {
		return value[0];
	}

	return undefined;
}

function parseBoolean(value: unknown) {
	if (value == null) {
		return null;
	}

	if (value === true || value === 'true' || value === '1') {
		return true;
	}

	if (value === false || value === 'false' || value === '0') {
		return false;
	}

	return null;
}

function emitEvent(req: express.Request, eventName: string, payload: unknown) {
	const emitter = req.app?.locals?.emitEvent;
	if (emitter) {
		emitter(eventName, payload);
	}
}

router.post('/routes/plan/:shipmentId', async (req, res, next) => {
	try {
		const result = await generateInitialRoute(req.params.shipmentId, req.body || {});

		emitEvent(req, 'shipment:updated', {
			shipmentId: req.params.shipmentId,
			routePlanId: result.routePlan.id,
			status: 'route_planned'
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'route_generated', shipmentId: req.params.shipmentId });

		res.status(201).json({ data: result });
	} catch (error) {
		next(error);
	}
});

router.get('/routes/:shipmentId', async (req, res, next) => {
	try {
		const result = await getActiveRouteForShipment(req.params.shipmentId);

		if (!result) {
			return res.status(404).json({ error: 'NotFound', message: 'Active route not found' });
		}

		return res.json({ data: result });
	} catch (error) {
		return next(error);
	}
});

router.get('/routes/:shipmentId/alternatives', async (req, res, next) => {
	try {
		const requested = Number.parseInt(getQueryString(req.query.limit) ?? '', 10);
		const limit = Number.isNaN(requested) ? 3 : Math.min(Math.max(requested, 1), 10);

		const alternatives = await getTopAlternativeRoutes(req.params.shipmentId, limit);
		return res.json({ data: alternatives });
	} catch (error) {
		return next(error);
	}
});

router.post('/routes/:shipmentId/reroute', async (req, res, next) => {
	try {
		const result = await rerouteShipment(req.params.shipmentId, req.body || {});

		emitEvent(req, 'shipment:rerouted', {
			shipmentId: req.params.shipmentId,
			routePlanId: result.routePlan.id
		});
		emitEvent(req, 'shipment:updated', {
			shipmentId: req.params.shipmentId,
			routePlanId: result.routePlan.id,
			status: 'rerouted'
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'shipment_rerouted', shipmentId: req.params.shipmentId });

		return res.status(201).json({ data: result });
	} catch (error) {
		return next(error);
	}
});

router.get('/network/nodes', async (req, res, next) => {
	try {
		const { limit, offset } = parsePagination(req.query);
		const nodes = await listNetworkNodes({
			type: getQueryString(req.query.type),
			is_active: parseBoolean(req.query.is_active),
			city: getQueryString(req.query.city),
			country: getQueryString(req.query.country),
			limit,
			offset
		});

		return res.json({ data: nodes, paging: { limit, offset } });
	} catch (error) {
		return next(error);
	}
});

router.get('/network/edges', async (req, res, next) => {
	try {
		const { limit, offset } = parsePagination(req.query);
		const edges = await listNetworkEdges({
			from_node_id: getQueryString(req.query.from_node_id),
			to_node_id: getQueryString(req.query.to_node_id),
			transport_mode: getQueryString(req.query.transport_mode),
			is_blocked: parseBoolean(req.query.is_blocked),
			is_active: parseBoolean(req.query.is_active),
			limit,
			offset
		});

		return res.json({ data: edges, paging: { limit, offset } });
	} catch (error) {
		return next(error);
	}
});

export default router;
