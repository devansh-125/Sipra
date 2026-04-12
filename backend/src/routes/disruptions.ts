import express from 'express';
import {
	detectDisruptions,
	listDisruptions,
	resolveDisruption,
	simulateDisruption
} from '../services/disruptionService.js';
import { DISRUPTION_STATUSES, DISRUPTION_TYPES } from '../utils/constants.js';
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

function parseNumber(value: unknown): number | undefined {
	const asString = getQueryString(value);
	if (!asString) {
		return undefined;
	}

	const parsed = Number.parseFloat(asString);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function emitEvent(req: express.Request, eventName: string, payload: unknown) {
	const emitter = req.app?.locals?.emitEvent;
	if (emitter) {
		emitter(eventName, payload);
	}
}

router.get('/', async (req, res, next) => {
	try {
		const { limit, offset } = parsePagination(req.query);
		const status = getQueryString(req.query.status);
		const type = getQueryString(req.query.type);

		if (status && !DISRUPTION_STATUSES.includes(status)) {
			return res.status(400).json({
				error: 'ValidationError',
				message: `status must be one of: ${DISRUPTION_STATUSES.join(', ')}`
			});
		}

		if (type && !DISRUPTION_TYPES.includes(type)) {
			return res.status(400).json({
				error: 'ValidationError',
				message: `type must be one of: ${DISRUPTION_TYPES.join(', ')}`
			});
		}

		const disruptions = await listDisruptions({
			status,
			type,
			source: getQueryString(req.query.source),
			node_id: getQueryString(req.query.node_id),
			edge_id: getQueryString(req.query.edge_id),
			severity_gte: parseNumber(req.query.severity_gte),
			severity_lte: parseNumber(req.query.severity_lte),
			limit,
			offset
		});

		return res.json({ data: disruptions, paging: { limit, offset } });
	} catch (error) {
		return next(error);
	}
});

router.post('/simulate', async (req, res, next) => {
	try {
		const disruption = await simulateDisruption(req.body || {});

		emitEvent(req, 'disruption:new', {
			disruptionId: disruption.id,
			type: disruption.type,
			severity: disruption.severity
		});
		emitEvent(req, 'alert:new', {
			disruptionId: disruption.id,
			severity: disruption.severity,
			title: disruption.title
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'disruption_simulated', disruptionId: disruption.id });

		return res.status(201).json({ data: disruption });
	} catch (error) {
		return next(error);
	}
});

router.post('/detect', async (req, res, next) => {
	try {
		const result = await detectDisruptions(req.body || {});

		for (const disruption of result.disruptions) {
			emitEvent(req, 'disruption:new', {
				disruptionId: disruption.id,
				type: disruption.type,
				severity: disruption.severity
			});
			emitEvent(req, 'alert:new', {
				disruptionId: disruption.id,
				severity: disruption.severity,
				title: disruption.title
			});
		}

		if (result.created_count > 0) {
			emitEvent(req, 'dashboard:refresh', {
				reason: 'disruption_detected',
				createdCount: result.created_count
			});
		}

		return res.status(201).json({ data: result });
	} catch (error) {
		return next(error);
	}
});

router.patch('/:id/resolve', async (req, res, next) => {
	try {
		const disruption = await resolveDisruption(req.params.id, req.body || {});

		if (!disruption) {
			return res.status(404).json({ error: 'NotFound', message: 'Disruption not found' });
		}

		emitEvent(req, 'disruption:resolved', {
			disruptionId: disruption.id,
			status: disruption.status
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'disruption_resolved', disruptionId: disruption.id });

		return res.json({ data: disruption });
	} catch (error) {
		return next(error);
	}
});

export default router;
