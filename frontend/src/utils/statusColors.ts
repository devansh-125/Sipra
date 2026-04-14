export type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

export function normalizeStatusText(status?: string | null): string {
  const raw = String(status || '').trim();
  if (!raw) {
    return 'unknown';
  }

  return raw.replace(/_/g, ' ');
}

export function getStatusTone(status: string): StatusTone {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'delivered') {
    return 'green';
  }
  if (normalized === 'in_transit') {
    return 'blue';
  }
  if (normalized === 'delayed') {
    return 'red';
  }
  if (normalized === 'pending') {
    return 'yellow';
  }
  return 'gray';
}

export function getPriorityTone(priority?: string | null): StatusTone {
  const normalized = String(priority || '').toLowerCase();

  if (normalized === 'critical') {
    return 'red';
  }
  if (normalized === 'high') {
    return 'yellow';
  }
  if (normalized === 'medium') {
    return 'blue';
  }
  return 'gray';
}

export function getSeverityTone(severity: number): Exclude<StatusTone, 'gray'> {
  if (severity >= 8) {
    return 'red';
  }
  if (severity >= 5) {
    return 'yellow';
  }
  return 'blue';
}
