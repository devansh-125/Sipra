export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatMinutesToEta(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
