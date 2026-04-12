export function normalizeRiskLabel(probability: number): 'Low' | 'Medium' | 'High' | 'Critical' {
  if (probability >= 0.8) {
    return 'Critical';
  }
  if (probability >= 0.6) {
    return 'High';
  }
  if (probability >= 0.35) {
    return 'Medium';
  }
  return 'Low';
}
