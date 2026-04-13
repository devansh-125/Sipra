type RealtimeStatusBadgeProps = {
  state: 'connected' | 'reconnecting' | 'disconnected';
  labelOverride?: string;
  compact?: boolean;
  showDot?: boolean;
};

const labels: Record<RealtimeStatusBadgeProps['state'], string> = {
  connected: 'Live Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline'
};

const containerClasses: Record<RealtimeStatusBadgeProps['state'], string> = {
  connected: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
  reconnecting: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
  disconnected: 'border-rose-500/30 bg-rose-500/15 text-rose-200'
};

const dotClasses: Record<RealtimeStatusBadgeProps['state'], string> = {
  connected: 'bg-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]',
  reconnecting: 'bg-amber-300 animate-pulse shadow-[0_0_0_4px_rgba(245,158,11,0.2)]',
  disconnected: 'bg-rose-300 shadow-[0_0_0_4px_rgba(244,63,94,0.2)]'
};

export default function RealtimeStatusBadge({
  state,
  labelOverride,
  compact = false,
  showDot = true
}: RealtimeStatusBadgeProps) {
  const text = labelOverride || labels[state];

  return (
    <span
      role="status"
      aria-live="polite"
      title={`Realtime state: ${text}`}
      className={`inline-flex items-center rounded-full border ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'} ${containerClasses[state]}`}
    >
      {showDot ? <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${dotClasses[state]}`} /> : null}
      {text}
    </span>
  );
}
