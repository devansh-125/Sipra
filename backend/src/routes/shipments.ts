import express from 'express';
import {
	addShipmentLocation,
	createShipment,
	getShipmentById,
	getShipmentByTrackingNumber,
	getShipmentEvents,
	listShipments,
	updateShipmentStatus
} from '../services/shipmentService.js';
import { SHIPMENT_STATUSES } from '../utils/constants.js';
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

function emitEvent(req, eventName, payload) {
	const emitter = req.app?.locals?.emitEvent;
	if (emitter) {
		emitter(eventName, payload);
	}
}

router.post('/', async (req, res, next) => {
	try {
		const shipment = await createShipment(req.body);

		emitEvent(req, 'shipment:updated', {
			shipmentId: shipment.id,
			status: shipment.status,
			trackingNumber: shipment.tracking_number
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'shipment_created', shipmentId: shipment.id });

		res.status(201).json({ data: shipment });
	} catch (error) {
		next(error);
	}
});

router.get('/', async (req, res, next) => {
	try {
		const { limit, offset } = parsePagination(req.query);
		const shipments = await listShipments({
			status: getQueryString(req.query.status),
			carrierId: getQueryString(req.query.carrier_id),
			limit,
			offset
		});

		res.json({ data: shipments, paging: { limit, offset } });
	} catch (error) {
		next(error);
	}
});

router.get('/track/:trackingNumber', async (req, res, next) => {
	try {
		const shipment = await getShipmentByTrackingNumber(req.params.trackingNumber);

		if (!shipment) {
			return res.status(404).json({ error: 'NotFound', message: 'Shipment not found' });
		}

		return res.json({ data: shipment });
	} catch (error) {
		return next(error);
	}
});

router.get('/:id/events', async (req, res, next) => {
	try {
		const shipment = await getShipmentById(req.params.id);
		if (!shipment) {
			return res.status(404).json({ error: 'NotFound', message: 'Shipment not found' });
		}

		const events = await getShipmentEvents(req.params.id);
		return res.json({ data: events });
	} catch (error) {
		return next(error);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		const shipment = await getShipmentById(req.params.id);

		if (!shipment) {
			return res.status(404).json({ error: 'NotFound', message: 'Shipment not found' });
		}

		return res.json({ data: shipment });
	} catch (error) {
		return next(error);
	}
});

router.patch('/:id/status', async (req, res, next) => {
	try {
		const { status, source } = req.body;

		if (!status || !SHIPMENT_STATUSES.includes(status)) {
			return res.status(400).json({
				error: 'ValidationError',
				message: `status must be one of: ${SHIPMENT_STATUSES.join(', ')}`
			});
		}

		const shipment = await updateShipmentStatus(req.params.id, status, source || 'user');

		if (!shipment) {
			return res.status(404).json({ error: 'NotFound', message: 'Shipment not found' });
		}

		emitEvent(req, 'shipment:updated', { shipmentId: shipment.id, status: shipment.status });

		if (shipment.status === 'delayed') {
			emitEvent(req, 'shipment:delayed', { shipmentId: shipment.id, status: shipment.status });
		}

		if (shipment.status === 'delivered') {
			emitEvent(req, 'shipment:delivered', { shipmentId: shipment.id, status: shipment.status });
		}

		emitEvent(req, 'dashboard:refresh', { reason: 'shipment_status_changed', shipmentId: shipment.id });

		return res.json({ data: shipment });
	} catch (error) {
		return next(error);
	}
});

router.post('/:id/location', async (req, res, next) => {
	try {
		const shipment = await addShipmentLocation(req.params.id, req.body);

		if (!shipment) {
			return res.status(404).json({ error: 'NotFound', message: 'Shipment not found' });
		}

		emitEvent(req, 'shipment:updated', {
			shipmentId: shipment.id,
			latitude: shipment.current_latitude,
			longitude: shipment.current_longitude
		});
		emitEvent(req, 'dashboard:refresh', { reason: 'shipment_location_updated', shipmentId: shipment.id });

		return res.status(201).json({ data: shipment });
	} catch (error) {
		return next(error);
	}
});

export default router;
