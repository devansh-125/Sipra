const layers = ['Shipments', 'Disruptions', 'Routes', 'Hubs'];

export default function MapLayerToggles() {
  return (
    <div className="flex flex-wrap gap-2">
      {layers.map((layer) => (
        <button key={layer} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs hover:border-slate-500">
          {layer}
        </button>
      ))}
    </div>
  );
}
