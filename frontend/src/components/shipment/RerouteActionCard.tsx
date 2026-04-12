import SectionCard from '../common/SectionCard.tsx';

export default function RerouteActionCard() {
  return (
    <SectionCard title="Route Actions" subtitle="Apply AI recommendation when reroute is available">
      <button className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500">
        Reroute Shipment
      </button>
    </SectionCard>
  );
}
