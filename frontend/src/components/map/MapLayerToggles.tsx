import type { MapLayerKey, MapLayerState } from '../../hooks/useMapLayers.ts';

const LAYERS: Array<{ key: MapLayerKey; label: string }> = [
  { key: 'shipments', label: 'Shipments' },
  { key: 'disruptions', label: 'Disruptions' },
  { key: 'routes', label: 'Routes' },
  { key: 'hubs', label: 'Hubs' }
];

type MapLayerTogglesProps = {
  layers: MapLayerState;
  counts?: Partial<Record<MapLayerKey, number>>;
  onToggle: (layer: MapLayerKey) => void;
};

export default function MapLayerToggles({ layers, counts, onToggle }: MapLayerTogglesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {LAYERS.map((layer) => (
        <button
          key={layer.key}
          type="button"
          onClick={() => onToggle(layer.key)}
          aria-pressed={layers[layer.key]}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            layers[layer.key]
              ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-100'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
          }`}
        >
          {layer.label}
          {typeof counts?.[layer.key] === 'number' ? (
            <span className="ml-1 rounded-full bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-200">
              {counts[layer.key]}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
