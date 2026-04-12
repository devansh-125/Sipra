import SectionCard from '../common/SectionCard.tsx';

export default function GodModeControls() {
  return (
    <SectionCard title="God Mode" subtitle="Trigger dramatic scenarios for demo impact">
      <div className="grid grid-cols-1 gap-2">
        <button className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold hover:bg-rose-500">
          Simulate Monsoon Flood
        </button>
        <button className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold hover:bg-amber-500">
          Simulate Port Congestion
        </button>
        <button className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold hover:bg-red-600">
          Simulate Highway Closure
        </button>
        <button className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600">
          Reset Network
        </button>
      </div>
    </SectionCard>
  );
}
