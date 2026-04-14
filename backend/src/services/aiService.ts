import db from '../db/connection.js';
import { simulateDisruption } from './disruptionService.js';

type HttpError = Error & { statusCode: number };

type GenericPayload = Record<string, unknown>;

type PredictDelayPayload = GenericPayload & {
  shipment_id?: string;
  distance_km?: number;
  weather_risk_score?: number;
  traffic_risk_score?: number;
  congestion_score?: number;
  disruptions_count?: number;
  priority?: string;
  current_eta_minutes?: number;
  use_remote?: boolean;
};

type DetectAnomalyPayload = GenericPayload & {
  metrics?: Record<string, number>;
  threshold?: number;
  use_remote?: boolean;
};

type RouteCandidate = {
  id?: string;
  distance_km?: number;
  estimated_time_min?: number;
  weather_risk?: number;
  traffic_risk?: number;
  disruption_risk?: number;
  cost?: number;
};

type ScoreRoutePayload = GenericPayload & {
  candidates?: RouteCandidate[];
  weights?: {
    time?: number;
    distance?: number;
    weather?: number;
    traffic?: number;
    disruption?: number;
    cost?: number;
  };
  use_remote?: boolean;
};

type RecommendRoutePayload = ScoreRoutePayload;

type SimulateDisruptionPayload = GenericPayload & {
  type?: string;
  severity?: number;
  node_id?: string;
  edge_id?: string;
  latitude?: number;
  longitude?: number;
  affected_radius_km?: number;
  starts_at?: string;
  ends_at?: string;
  title?: string;
  description?: string;
  persist?: boolean;
  use_remote?: boolean;
};

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message);
  (error as HttpError).statusCode = statusCode;
  return error as HttpError;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function computeRiskLevel(probability: number): 'low' | 'medium' | 'high' | 'critical' {
  if (probability >= 0.8) {
    return 'critical';
  }

  if (probability >= 0.6) {
    return 'high';
  }

  if (probability >= 0.35) {
    return 'medium';
  }

  return 'low';
}

function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights;
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = value / total;
  }

  return normalized;
}

async function callRemoteAi(path: string, payload: GenericPayload): Promise<any | null> {
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  if (!aiServiceUrl) {
    return null;
  }

  const timeoutMs = Math.max(1000, Number.parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '8000', 10));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const key = process.env.AI_SERVICE_API_KEY || process.env.INTERNAL_API_KEY;
    const response = await fetch(`${aiServiceUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'x-internal-api-key': key } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AI service call failed: ${response.status}`);
    }

    const parsed = (await response.json()) as Record<string, unknown>;
    return parsed.data ?? parsed;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`Remote AI fallback triggered for ${path}:`, error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeStoreDelayPrediction(
  payload: PredictDelayPayload,
  delay_probability: number,
  predicted_delay_min: number,
  risk_level: 'low' | 'medium' | 'high' | 'critical',
  factors: Record<string, number>
) {
  if (!payload.shipment_id) {
    return;
  }

  const top_factors_json = Object.entries(factors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([factor, value]) => ({ factor, value }));

  try {
    await db('delay_predictions').insert({
      shipment_id: payload.shipment_id,
      model_name: 'heuristic-delay-model',
      model_version: 'v1',
      input_features_json: JSON.stringify(payload),
      delay_probability,
      predicted_delay_min,
      risk_level,
      top_factors_json: JSON.stringify(top_factors_json)
    });
  } catch {
    // May fail if shipment not yet committed (nested transaction)
  }
}

export async function predictDelay(payload: PredictDelayPayload): Promise<any> {
  if (payload.use_remote !== false) {
    const remote = await callRemoteAi('/ai/predict-delay', payload);
    if (remote) {
      return remote;
    }
  }

  const distance = toNumber(payload.distance_km, 150);
  const weather = clamp(toNumber(payload.weather_risk_score, 0.2));
  const traffic = clamp(toNumber(payload.traffic_risk_score, 0.25));
  const congestion = clamp(toNumber(payload.congestion_score, 0.2));
  const disruptions = Math.max(0, toNumber(payload.disruptions_count, 0));
  const etaMinutes = Math.max(0, toNumber(payload.current_eta_minutes, distance * 1.4));

  const priorityFactorByName: Record<string, number> = {
    low: 0,
    medium: 0.02,
    high: 0.04,
    critical: 0.06
  };
  const priorityFactor = priorityFactorByName[String(payload.priority || 'medium')] || 0.02;

  const delay_probability = clamp(
    0.05 + weather * 0.25 + traffic * 0.25 + congestion * 0.18 + disruptions * 0.08 + (distance / 1200) * 0.12 + priorityFactor,
    0,
    0.99
  );

  const predicted_delay_min = Math.round(
    delay_probability * (etaMinutes * 0.35) + disruptions * 22 + weather * 30 + traffic * 24 + congestion * 18
  );

  const risk_level = computeRiskLevel(delay_probability);
  const factors = {
    weather,
    traffic,
    congestion,
    disruptions,
    distance: distance / 1000,
    priority_factor: priorityFactor
  };

  await maybeStoreDelayPrediction(payload, delay_probability, predicted_delay_min, risk_level, factors);

  return {
    delay_probability,
    predicted_delay_min,
    risk_level,
    factors,
    model: {
      name: 'heuristic-delay-model',
      version: 'v1',
      source: 'node-fallback'
    }
  };
}

export async function detectAnomaly(payload: DetectAnomalyPayload): Promise<any> {
  if (payload.use_remote !== false) {
    const remote = await callRemoteAi('/ai/detect-anomaly', payload);
    if (remote) {
      return remote;
    }
  }

  const metrics = payload.metrics || {};
  const normalizedEntries = Object.entries(metrics).map(([key, value]) => [key, clamp(toNumber(value, 0), 0, 1)] as const);

  const anomaly_score = normalizedEntries.length
    ? normalizedEntries.reduce((sum, [, value]) => sum + value, 0) / normalizedEntries.length
    : 0;

  const threshold = clamp(toNumber(payload.threshold, 0.7));
  const top_indicators = normalizedEntries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([metric, score]) => ({ metric, score }));

  return {
    anomaly_score,
    threshold,
    is_anomaly: anomaly_score >= threshold,
    top_indicators,
    model: {
      name: 'heuristic-anomaly-model',
      version: 'v1',
      source: 'node-fallback'
    }
  };
}

export async function scoreRouteCandidates(payload: ScoreRoutePayload): Promise<any> {
  if (payload.use_remote !== false) {
    const remote = await callRemoteAi('/ai/score-route', payload);
    if (remote) {
      return remote;
    }
  }

  const candidates = payload.candidates || [];
  if (candidates.length === 0) {
    throw createHttpError(400, 'candidates array is required');
  }

  const maxDistance = Math.max(...candidates.map((candidate) => toNumber(candidate.distance_km, 0)), 1);
  const maxTime = Math.max(...candidates.map((candidate) => toNumber(candidate.estimated_time_min, 0)), 1);
  const maxCost = Math.max(...candidates.map((candidate) => toNumber(candidate.cost, 0)), 1);

  const weights = normalizeWeights({
    time: toNumber(payload.weights?.time, 0.3),
    distance: toNumber(payload.weights?.distance, 0.2),
    weather: toNumber(payload.weights?.weather, 0.15),
    traffic: toNumber(payload.weights?.traffic, 0.15),
    disruption: toNumber(payload.weights?.disruption, 0.15),
    cost: toNumber(payload.weights?.cost, 0.05)
  });

  const scored_routes = candidates
    .map((candidate, index) => {
      const distancePenalty = clamp(toNumber(candidate.distance_km, maxDistance) / maxDistance);
      const timePenalty = clamp(toNumber(candidate.estimated_time_min, maxTime) / maxTime);
      const costPenalty = clamp(toNumber(candidate.cost, 0) / maxCost);
      const weatherPenalty = clamp(toNumber(candidate.weather_risk, 0));
      const trafficPenalty = clamp(toNumber(candidate.traffic_risk, 0));
      const disruptionPenalty = clamp(toNumber(candidate.disruption_risk, 0));

      const weightedPenalty =
        timePenalty * weights.time +
        distancePenalty * weights.distance +
        weatherPenalty * weights.weather +
        trafficPenalty * weights.traffic +
        disruptionPenalty * weights.disruption +
        costPenalty * weights.cost;

      const score = clamp(1 - weightedPenalty, 0, 1);

      return {
        candidate_id: candidate.id || `candidate_${index + 1}`,
        score,
        breakdown: {
          time_penalty: timePenalty,
          distance_penalty: distancePenalty,
          weather_penalty: weatherPenalty,
          traffic_penalty: trafficPenalty,
          disruption_penalty: disruptionPenalty,
          cost_penalty: costPenalty,
          weighted_penalty: weightedPenalty
        },
        candidate
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    scored_routes,
    model: {
      name: 'heuristic-route-scorer',
      version: 'v1',
      source: 'node-fallback'
    }
  };
}

export async function recommendRoute(payload: RecommendRoutePayload): Promise<any> {
  if (payload.use_remote !== false) {
    const remote = await callRemoteAi('/ai/recommend-route', payload);
    if (remote) {
      return remote;
    }
  }

  const scored = await scoreRouteCandidates({
    candidates: payload.candidates,
    weights: payload.weights,
    use_remote: false
  });

  if (!scored.scored_routes.length) {
    throw createHttpError(400, 'No candidates available for recommendation');
  }

  return {
    recommended_route: scored.scored_routes[0],
    alternatives: scored.scored_routes.slice(1, 3),
    model: {
      name: 'heuristic-route-recommender',
      version: 'v1',
      source: 'node-fallback'
    }
  };
}

export async function generateDisruptionScenario(payload: SimulateDisruptionPayload): Promise<any> {
  if (payload.use_remote !== false) {
    const remote = await callRemoteAi('/ai/simulate-disruption', payload);
    if (remote) {
      return remote;
    }
  }

  const severity = Math.max(1, Math.min(10, Math.round(toNumber(payload.severity, 7))));
  const impacted_shipments_estimate = Math.max(1, Math.round(severity * 2 + toNumber(payload.affected_radius_km, 20) / 5));
  const estimated_delay_min = Math.round(severity * 8 + toNumber(payload.affected_radius_km, 20) * 0.6);

  const scenario = {
    type: payload.type || 'weather',
    severity,
    node_id: payload.node_id || null,
    edge_id: payload.edge_id || null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    affected_radius_km: Math.max(0, toNumber(payload.affected_radius_km, 20)),
    impacted_shipments_estimate,
    estimated_average_delay_min: estimated_delay_min,
    generated_at: new Date().toISOString()
  };

  let persisted_disruption = null;
  if (payload.persist) {
    persisted_disruption = await simulateDisruption({
      type: scenario.type,
      severity: scenario.severity,
      node_id: scenario.node_id || undefined,
      edge_id: scenario.edge_id || undefined,
      latitude: scenario.latitude ?? undefined,
      longitude: scenario.longitude ?? undefined,
      affected_radius_km: scenario.affected_radius_km,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      title: payload.title || 'AI simulated disruption',
      description: payload.description || `AI generated ${scenario.type} scenario`,
      source: 'AI'
    });
  }

  return {
    scenario,
    persisted_disruption,
    model: {
      name: 'heuristic-disruption-simulator',
      version: 'v1',
      source: 'node-fallback'
    }
  };
}
