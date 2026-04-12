import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';

export default function AiInsightsPanel() {
  return (
    <SectionCard title="AI Insights" subtitle="Delay probability, factors, confidence, and model info">
      <div className="space-y-3">
        <EmptyState label="Delay probability + predicted delay minutes" />
        <EmptyState label="Top factors + model version + last prediction time" />
        <EmptyState label="Confidence signal" />
      </div>
    </SectionCard>
  );
}
