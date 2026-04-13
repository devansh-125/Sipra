import { useEffect, useState, type PropsWithChildren } from 'react';
import LastUpdatedStamp from '../realtime/LastUpdatedStamp.tsx';
import RealtimeStatusBadge from '../realtime/RealtimeStatusBadge.tsx';

export default function AppShell({ children }: PropsWithChildren) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date().toLocaleTimeString());
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'connected' : 'disconnected'
  );

  useEffect(() => {
    const tick = window.setInterval(() => {
      setLastUpdatedAt(new Date().toLocaleTimeString());
    }, 15000);

    function handleOnline() {
      setConnectionState('reconnecting');
      window.setTimeout(() => {
        setConnectionState('connected');
      }, 800);
    }

    function handleOffline() {
      setConnectionState('disconnected');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.clearInterval(tick);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.15),_transparent_45%),radial-gradient(ellipse_at_bottom,_rgba(34,197,94,0.08),_transparent_55%)]" />

      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Smart Logistics Twin</p>
            <h1 className="text-sm md:text-base font-semibold text-slate-100">Supply Chain Command Center</h1>
          </div>

          <div className="flex items-center gap-3">
            <RealtimeStatusBadge state={connectionState} />
            <LastUpdatedStamp lastUpdatedAt={lastUpdatedAt} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <p className="text-[11px] text-slate-500">Demo mode: data may be simulated for scenario walkthroughs.</p>
      </footer>
    </div>
  );
}
