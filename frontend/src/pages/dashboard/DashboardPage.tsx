import { useMemo, useState } from 'react';
import AppShell from '../../components/layout/AppShell.tsx';
import PageHeader from '../../components/layout/PageHeader.tsx';
import KpiCardsRow from '../../components/dashboard/KpiCardsRow.tsx';
import LargeMapPanel from '../../components/dashboard/LargeMapPanel.tsx';
import DashboardSidePanel from '../../components/dashboard/DashboardSidePanel.tsx';
import DashboardChartsSection from '../../components/dashboard/DashboardChartsSection.tsx';
import AiInsightsPanel from '../../components/dashboard/AiInsightsPanel.tsx';
import GenAiReportPanel from '../../components/dashboard/GenAiReportPanel.tsx';
import AiChatPanel from '../../components/dashboard/AiChatPanel.tsx';
import AiAgentPanel from '../../components/dashboard/AiAgentPanel.tsx';
import GodModeControls from '../../components/dashboard/GodModeControls.tsx';
import RealtimeStatusBadge from '../../components/realtime/RealtimeStatusBadge.tsx';
import LastUpdatedStamp from '../../components/realtime/LastUpdatedStamp.tsx';
import { useDashboardData } from '../../hooks/useDashboardData.ts';
import { useRealtime } from '../../hooks/useRealtime.ts';
import { DASHBOARD_REFRESH_INTERVAL_MS } from '../../utils/constants.ts';

export default function DashboardPage() {
  const [refreshNonce, setRefreshNonce] = useState(0);

  const { data, error, isLoading, isRefreshing, refresh } = useDashboardData({
    refreshIntervalMs: DASHBOARD_REFRESH_INTERVAL_MS,
    mapLimit: 350,
    bottleneckLimit: 12,
    alertLimit: 30
  });

  const realtime = useRealtime();

  const headerBadges = useMemo(() => {
    if (!data.summary) {
      return ['Initializing live summary'];
    }

    return [
      `${data.summary.shipments.in_transit} in transit`,
      `${data.summary.shipments.delayed} delayed`,
      `${data.summary.disruptions.active} active disruptions`,
      `${data.summary.alerts.open} open alerts`
    ];
  }, [data.summary]);

  async function handleRefreshAll() {
    await refresh();
    setRefreshNonce((current) => current + 1);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Supply Chain Control Tower"
          subtitle="Real-time network health, disruptions, and AI recommendations"
          eyebrow="Operations Dashboard"
          badges={headerBadges}
          tone={realtime.connectionState === 'connected' ? 'cyan' : realtime.connectionState === 'reconnecting' ? 'amber' : 'rose'}
          rightSlot={
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2">
                <RealtimeStatusBadge state={realtime.connectionState} compact />
                {isRefreshing ? <span className="text-[11px] text-cyan-300">Refreshing...</span> : null}
              </div>

              {data.fetchedAt ? (
                <LastUpdatedStamp lastUpdatedAt={data.fetchedAt} staleAfterSeconds={45} label="Dashboard" />
              ) : (
                <span className="text-xs text-slate-500">Waiting for first live sync...</span>
              )}

              <button
                type="button"
                onClick={() => void handleRefreshAll()}
                disabled={isLoading || isRefreshing}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-60"
              >
                {isLoading ? 'Loading...' : isRefreshing ? 'Refreshing...' : 'Refresh All Panels'}
              </button>
            </div>
          }
        />

        {error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        ) : null}

        <KpiCardsRow key={`kpi-${refreshNonce}`} />

        <section className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3">
            <LargeMapPanel key={`map-${refreshNonce}`} />
          </div>
          <div className="xl:col-span-1 space-y-6">
            <DashboardSidePanel key={`side-${refreshNonce}`} />
          </div>
        </section>

        <DashboardChartsSection key={`charts-${refreshNonce}`} />

        {/* ── Generative AI Section ──────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-cyan-200 tracking-wide">
            Generative AI Command Center
          </h2>
          <p className="text-xs text-slate-400">
            AI-powered insights, autonomous agent, and natural-language assistant — all grounded in your live supply chain data.
          </p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GenAiReportPanel key={`genai-report-${refreshNonce}`} />
          <AiChatPanel key={`chat-${refreshNonce}`} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AiAgentPanel key={`agent-${refreshNonce}`} />
          <div className="space-y-6">
            <AiInsightsPanel key={`ai-${refreshNonce}`} />
            <GodModeControls key={`god-modes-${refreshNonce}`} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
