type LastUpdatedStampProps = {
  lastUpdatedAt: string | number | Date;
  staleAfterSeconds?: number;
  showRelative?: boolean;
  label?: string;
};

function toDate(value: LastUpdatedStampProps['lastUpdatedAt']): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toRelativeText(secondsAgo: number): string {
  if (secondsAgo < 60) {
    return `${secondsAgo}s ago`;
  }

  const minutes = Math.floor(secondsAgo / 60);
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

export default function LastUpdatedStamp({
  lastUpdatedAt,
  staleAfterSeconds = 60,
  showRelative = true,
  label = 'Data last updated'
}: LastUpdatedStampProps) {
  const parsed = toDate(lastUpdatedAt);

  if (!parsed) {
    return <span className="text-xs text-amber-300">{label}: unknown</span>;
  }

  const now = Date.now();
  const secondsAgo = Math.max(0, Math.floor((now - parsed.getTime()) / 1000));
  const isStale = secondsAgo >= staleAfterSeconds;

  const absolute = parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const relative = toRelativeText(secondsAgo);
  const text = showRelative ? `${label}: ${relative} (${absolute})` : `${label}: ${absolute}`;

  return (
    <span
      title={parsed.toLocaleString()}
      className={`text-xs ${isStale ? 'text-amber-300' : 'text-slate-400'}`}
    >
      {text}
    </span>
  );
}
