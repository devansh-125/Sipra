import SectionCard from '../common/SectionCard.tsx';
import SupplyChainMap from '../map/SupplyChainMap.tsx';
import MapLayerToggles from '../map/MapLayerToggles.tsx';

export default function LargeMapPanel() {
  return (
    <SectionCard
      title="Network Live Map"
      subtitle="Shipments, routes, disruptions, and hub nodes in one view"
    >
      <div className="space-y-3">
        <MapLayerToggles />
        <SupplyChainMap />
      </div>
    </SectionCard>
  );
}
