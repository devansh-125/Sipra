type PercentFormatOptions = {
  decimals?: number;
  clamp?: boolean;
  suffix?: string;
};

type EtaFormatOptions = {
  compact?: boolean;
  hideZeroHours?: boolean;
  minUnit?: 'm' | 'h';
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatPercent(value: number, options: PercentFormatOptions = {}): string {
  const { decimals = 0, clamp: shouldClamp = true, suffix = '%' } = options;
  const safeDecimals = Math.max(0, Math.min(3, Math.floor(toNumber(decimals, 0))));
  const normalized = shouldClamp ? clamp(toNumber(value, 0), 0, 1) : toNumber(value, 0);
  const scaled = normalized * 100;

  if (safeDecimals === 0) {
    return `${Math.round(scaled)}${suffix}`;
  }

  return `${scaled.toFixed(safeDecimals)}${suffix}`;
}

export function formatMinutesToEta(minutes: number, options: EtaFormatOptions = {}): string {
  const { compact = false, hideZeroHours = false, minUnit = 'm' } = options;
  const totalMinutes = Math.max(0, Math.round(toNumber(minutes, 0)));

  if (minUnit === 'h') {
    const hoursOnly = Math.max(1, Math.round(totalMinutes / 60));
    return compact ? `${hoursOnly}h` : `${hoursOnly}h 0m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (compact) {
    if (hours <= 0) {
      return `${mins}m`;
    }
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  }

  if (hideZeroHours && hours === 0) {
    return `${mins}m`;
  }

  return `${hours}h ${mins}m`;
}

export function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) {
    return 'just now';
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return 'just now';
  }

  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDeltaMinutes(minutes: number): string {
  const rounded = Math.round(toNumber(minutes, 0));

  if (rounded === 0) {
    return 'No change';
  }

  if (rounded < 0) {
    return `${formatMinutesToEta(Math.abs(rounded), { compact: true })} faster`;
  }

  return `${formatMinutesToEta(rounded, { compact: true })} slower`;
}
