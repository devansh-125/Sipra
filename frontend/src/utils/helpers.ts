import type { Shipment } from '../types/shipment.ts';

/**
 * Safely coerce unknown value to a finite number.
 */
export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parse an API error response into a user-friendly string.
 */
export function parseApiError(error: unknown, fallback = 'Request failed'): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const raw = error.message || fallback;

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

type RiskLikeShipment = Pick<Shipment, 'delay_probability' | 'predicted_delay_min' | 'risk_level'>;

/**
 * Rank a shipment by composite risk score (0–1).
 * Used by many components to auto-select the highest-risk shipment.
 */
export function rankShipment(shipment: RiskLikeShipment): number {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelWeight =
    level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, levelWeight * 0.65 + delayWeight * 0.35);
}
