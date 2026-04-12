import express from 'express';
import { listAlerts, listAlertsByShipment, markAlertRead } from '../services/alertService.js';
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

function parseBoolean(value: unknown): boolean | null {
	const normalized = getQueryString(value);

	if (!normalized) {
		return null;
	}

	if (normalized === 'true' || normalized === '1') {
		return true;
	}

	if (normalized === 'false' || normalized === '0') {
		return false;
	}

	return null;
}

function parseNumber(value: unknown): number | undefined {
	const normalized = getQueryString(value);
	if (!normalized) {
		return undefined;
	}

	const parsed = Number.parseFloat(normalized);
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

		const alerts = await listAlerts({
			is_read: parseBoolean(req.query.is_read),
			alert_type: getQueryString(req.query.alert_type),
			severity_gte: parseNumber(req.query.severity_gte),
			severity_lte: parseNumber(req.query.severity_lte),
			shipment_id: getQueryString(req.query.shipment_id),
			limit,
			offset
		});

		return res.json({ data: alerts, paging: { limit, offset } });
	} catch (error) {
		return next(error);
	}
});

router.patch('/:id/read', async (req, res, next) => {
	try {
		const alert = await markAlertRead(req.params.id);

		if (!alert) {
			return res.status(404).json({ error: 'NotFound', message: 'Alert not found' });
		}

		emitEvent(req, 'dashboard:refresh', { reason: 'alert_read', alertId: alert.id });

		return res.json({ data: alert });
	} catch (error) {
		return next(error);
	}
});

router.get('/shipment/:shipmentId', async (req, res, next) => {
	try {
		const { limit, offset } = parsePagination(req.query);
		const alerts = await listAlertsByShipment(req.params.shipmentId, limit, offset);

		return res.json({ data: alerts, paging: { limit, offset } });
	} catch (error) {
		return next(error);
	}
});

export default router;
