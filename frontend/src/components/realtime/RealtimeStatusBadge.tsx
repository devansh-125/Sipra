type RealtimeStatusBadgeProps = {
  state: 'connected' | 'reconnecting' | 'disconnected';
};

const labels = {
  connected: 'Live Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline'
};

const classes = {
  connected: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  reconnecting: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  disconnected: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
};

export default function RealtimeStatusBadge({ state }: RealtimeStatusBadgeProps) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${classes[state]}`}>{labels[state]}</span>;
}
