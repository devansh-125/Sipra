import express from 'express';
import {
  detectAnomaly,
  generateDisruptionScenario,
  predictDelay,
  recommendRoute,
  scoreRouteCandidates
} from '../services/aiService.js';
import { requireInternalApiKey } from '../middleware/internalAuth.js';

const router = express.Router();

function emitEvent(req: express.Request, eventName: string, payload: unknown) {
  const emitter = req.app?.locals?.emitEvent;
  if (emitter) {
    emitter(eventName, payload);
  }
}

router.use(requireInternalApiKey);

router.post('/predict-delay', async (req, res, next) => {
  try {
    const result = await predictDelay(req.body || {});
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/detect-anomaly', async (req, res, next) => {
  try {
    const result = await detectAnomaly(req.body || {});
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/score-route', async (req, res, next) => {
  try {
    const result = await scoreRouteCandidates(req.body || {});
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/recommend-route', async (req, res, next) => {
  try {
    const result = await recommendRoute(req.body || {});
    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/simulate-disruption', async (req, res, next) => {
  try {
    const result = await generateDisruptionScenario(req.body || {});

    if (result.persisted_disruption) {
      emitEvent(req, 'disruption:new', {
        disruptionId: result.persisted_disruption.id,
        type: result.persisted_disruption.type,
        severity: result.persisted_disruption.severity
      });
      emitEvent(req, 'alert:new', {
        disruptionId: result.persisted_disruption.id,
        severity: result.persisted_disruption.severity,
        title: result.persisted_disruption.title
      });
      emitEvent(req, 'dashboard:refresh', {
        reason: 'ai_disruption_simulation',
        disruptionId: result.persisted_disruption.id
      });
    }

    return res.status(201).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
