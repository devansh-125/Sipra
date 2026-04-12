import express from 'express';
import {
	getBottlenecks,
	getDashboardSummary,
	getDelayTrends,
	getMapData,
	getRiskDistribution
} from '../services/dashboardService.js';

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

function parsePositiveInt(value: unknown, defaultValue: number, min = 1, max = 1000): number {
	const normalized = getQueryString(value);
	const parsed = Number.parseInt(normalized ?? '', 10);

	if (Number.isNaN(parsed)) {
		return defaultValue;
	}

	return Math.max(min, Math.min(max, parsed));
}

router.get('/summary', async (req, res, next) => {
	try {
		const summary = await getDashboardSummary();
		return res.json({ data: summary });
	} catch (error) {
		return next(error);
	}
});

router.get('/delay-trends', async (req, res, next) => {
	try {
		const days = parsePositiveInt(req.query.days, 14, 1, 90);
		const trends = await getDelayTrends(days);

		return res.json({
			data: trends,
			meta: { days }
		});
	} catch (error) {
		return next(error);
	}
});

router.get('/bottlenecks', async (req, res, next) => {
	try {
		const limit = parsePositiveInt(req.query.limit, 10, 1, 50);
		const bottlenecks = await getBottlenecks(limit);

		return res.json({
			data: bottlenecks,
			meta: { limit }
		});
	} catch (error) {
		return next(error);
	}
});

router.get('/map-data', async (req, res, next) => {
	try {
		const limit = parsePositiveInt(req.query.limit, 300, 10, 1000);
		const mapData = await getMapData(limit);

		return res.json({
			data: mapData,
			meta: { limit }
		});
	} catch (error) {
		return next(error);
	}
});

router.get('/risk-distribution', async (req, res, next) => {
	try {
		const distribution = await getRiskDistribution();
		return res.json({ data: distribution });
	} catch (error) {
		return next(error);
	}
});

export default router;
