export type RiskLabel = 'Low' | 'Medium' | 'High' | 'Critical';

type RiskLikeShipment = {
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRiskProbability(value: number): number {
  return clamp(toNumber(value, 0), 0, 1);
}

export function normalizeRiskLabel(probability: number): RiskLabel {
  const safeProbability = normalizeRiskProbability(probability);

  if (safeProbability >= 0.8) {
    return 'Critical';
  }
  if (safeProbability >= 0.6) {
    return 'High';
  }
  if (safeProbability >= 0.35) {
    return 'Medium';
  }
  return 'Low';
}

export function normalizeRiskLabelText(value?: string | null): RiskLabel {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'critical') {
    return 'Critical';
  }
  if (normalized === 'high') {
    return 'High';
  }
  if (normalized === 'medium') {
    return 'Medium';
  }
  return 'Low';
}

export function riskScoreFromLabel(value?: string | null, options: { lowScore?: number } = {}): number {
  const { lowScore = 0.2 } = options;
  const label = normalizeRiskLabelText(value);

  if (label === 'Critical') {
    return 1;
  }
  if (label === 'High') {
    return 0.8;
  }
  if (label === 'Medium') {
    return 0.55;
  }
  return clamp(lowScore, 0, 1);
}

export function mergeRiskSignals(
  probability: number,
  riskLevel?: string | null,
  options: { lowLabelScore?: number } = {}
): number {
  const probabilityScore = normalizeRiskProbability(probability);
  const labelScore = riskScoreFromLabel(riskLevel, { lowScore: options.lowLabelScore ?? 0.2 });
  return Math.max(probabilityScore, labelScore);
}

export function calculateShipmentRiskScore(shipment: RiskLikeShipment): number {
  const probability = normalizeRiskProbability(toNumber(shipment.delay_probability, 0));
  const predictedDelayWeight = Math.min(1, Math.max(0, toNumber(shipment.predicted_delay_min, 0)) / 240);
  const riskLevelWeight = riskScoreFromLabel(shipment.risk_level);
  return Math.max(probability, riskLevelWeight * 0.65 + predictedDelayWeight * 0.35);
}
