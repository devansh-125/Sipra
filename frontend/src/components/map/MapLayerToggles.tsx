import type { MapLayerKey, MapLayerState } from '../../types/map.ts';
import { MAP_LAYER_KEYS, MAP_LAYER_LABELS } from '../../utils/constants.ts';

type MapLayerTogglesProps = {
  layers: MapLayerState;
  counts?: Partial<Record<MapLayerKey, number>>;
  onToggle: (layer: MapLayerKey) => void;
};

export default function MapLayerToggles({ layers, counts, onToggle }: MapLayerTogglesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MAP_LAYER_KEYS.map((layerKey) => (
        <button
          key={layerKey}
          type="button"
          onClick={() => onToggle(layerKey)}
          aria-pressed={layers[layerKey]}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            layers[layerKey]
              ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-100'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
          }`}
        >
          {MAP_LAYER_LABELS[layerKey]}
          {typeof counts?.[layerKey] === 'number' ? (
            <span className="ml-1 rounded-full bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-200">
              {counts[layerKey]}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
