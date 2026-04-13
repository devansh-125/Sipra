export type AlertToast = {
  id: string;
  title: string;
  message?: string;
  source?: string;
  timestamp?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
};

type AlertToastStackProps = {
  toasts: AlertToast[];
  onDismiss?: (id: string) => void;
  maxVisible?: number;
};

function getSeverityClasses(severity: AlertToast['severity']) {
  if (severity === 'success') {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';
  }

  if (severity === 'critical') {
    return 'border-rose-500/40 bg-rose-500/15 text-rose-100';
  }

  if (severity === 'warning') {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-100';
  }

  return 'border-sky-500/40 bg-sky-500/15 text-sky-100';
}

function toRelativeTime(timestamp?: string): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return null;
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
  return `${hours}h ago`;
}

export default function AlertToastStack({ toasts, onDismiss, maxVisible = 4 }: AlertToastStackProps) {
  if (!toasts.length) {
    return null;
  }

  const visible = toasts.slice(0, Math.max(1, maxVisible));

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] space-y-2">
      {visible.map((toast) => {
        const relativeTime = toRelativeTime(toast.timestamp);

        return (
          <div
            key={toast.id}
            role={toast.severity === 'critical' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-lg backdrop-blur ${getSeverityClasses(toast.severity)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-xs opacity-90 line-clamp-2">{toast.message}</p> : null}
                <div className="mt-1 flex items-center gap-2 text-[11px] opacity-80">
                  {toast.source ? <span>{toast.source}</span> : null}
                  {relativeTime ? <span>{relativeTime}</span> : null}
                </div>
              </div>

              {onDismiss ? (
                <button
                  type="button"
                  aria-label="Dismiss toast"
                  className="rounded-md px-2 py-1 text-xs hover:bg-black/15"
                  onClick={() => onDismiss(toast.id)}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {toasts.length > visible.length ? (
        <div className="pointer-events-auto rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-300">
          +{toasts.length - visible.length} more alerts
        </div>
      ) : null}
    </div>
  );
}
