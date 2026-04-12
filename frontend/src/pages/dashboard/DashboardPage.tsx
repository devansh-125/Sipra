import AppShell from '../../components/layout/AppShell.tsx';
import PageHeader from '../../components/layout/PageHeader.tsx';
import KpiCardsRow from '../../components/dashboard/KpiCardsRow.tsx';
import LargeMapPanel from '../../components/dashboard/LargeMapPanel.tsx';
import DashboardSidePanel from '../../components/dashboard/DashboardSidePanel.tsx';
import DashboardChartsSection from '../../components/dashboard/DashboardChartsSection.tsx';
import AiInsightsPanel from '../../components/dashboard/AiInsightsPanel.tsx';
import GodModeControls from '../../components/dashboard/GodModeControls.tsx';

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Supply Chain Control Tower"
          subtitle="Real-time network health, disruptions, and AI recommendations"
        />

        <KpiCardsRow />

        <section className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3">
            <LargeMapPanel />
          </div>
          <div className="xl:col-span-1 space-y-6">
            <DashboardSidePanel />
            <AiInsightsPanel />
            <GodModeControls />
          </div>
        </section>

        <DashboardChartsSection />
      </div>
    </AppShell>
  );
}
