import express from 'express';
import { resetDemoState, seedDemoData, triggerGodMode } from '../services/simulationService.js';

const router = express.Router();

function isTruthy(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function ensureDemoApiEnabled(req: express.Request, res: express.Response, next: express.NextFunction) {
  const demoEnabled = isTruthy(process.env.DEMO_API_ENABLED, true);
  if (!demoEnabled) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Demo API is disabled. Set DEMO_API_ENABLED=true to enable demo endpoints.'
    });
  }

  if (process.env.NODE_ENV === 'production' && !isTruthy(process.env.DEMO_API_ALLOW_IN_PROD, false)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Demo API is blocked in production. Set DEMO_API_ALLOW_IN_PROD=true only if you explicitly want this.'
    });
  }

  return next();
}

function emitEvent(req: express.Request, eventName: string, payload: unknown) {
  const emitter = req.app?.locals?.emitEvent;
  if (emitter) {
    emitter(eventName, payload);
  }
}

router.use(ensureDemoApiEnabled);

router.post('/seed', async (req, res, next) => {
  try {
    const result = await seedDemoData(req.body || {});

    for (const item of result.shipments || []) {
      emitEvent(req, 'shipment:updated', {
        shipmentId: item.shipment.id,
        trackingNumber: item.shipment.tracking_number,
        status: item.shipment.status,
        routePlanId: item.route_plan_id
      });
    }

    emitEvent(req, 'dashboard:refresh', {
      reason: 'demo_seed',
      shipmentCount: (result.shipments || []).length
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/god-mode', async (req, res, next) => {
  try {
    const result = await triggerGodMode(req.body || {});

    if (result.disruption) {
      emitEvent(req, 'disruption:new', {
        disruptionId: result.disruption.id,
        type: result.disruption.type,
        severity: result.disruption.severity
      });

      emitEvent(req, 'alert:new', {
        disruptionId: result.disruption.id,
        severity: result.disruption.severity,
        title: result.disruption.title
      });
    }

    for (const shipment of result.impacted_shipments || []) {
      emitEvent(req, 'shipment:updated', {
        shipmentId: shipment.shipment_id,
        trackingNumber: shipment.tracking_number,
        status: 'delayed',
        predictedDelayMin: shipment.predicted_delay_min
      });

      if (shipment.rerouted) {
        emitEvent(req, 'shipment:rerouted', {
          shipmentId: shipment.shipment_id,
          source: 'demo_god_mode'
        });
      }
    }

    emitEvent(req, 'dashboard:refresh', {
      reason: 'demo_god_mode',
      impactedShipments: (result.impacted_shipments || []).length
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const result = await resetDemoState();

    emitEvent(req, 'dashboard:refresh', {
      reason: 'demo_reset',
      removed: result.removed
    });

    return res.json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;
