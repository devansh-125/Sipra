import { useState } from 'react';

export type MapLayerKey = 'shipments' | 'disruptions' | 'routes' | 'hubs';

export type MapLayerState = Record<MapLayerKey, boolean>;

export function useMapLayers() {
  const [layers, setLayers] = useState<MapLayerState>({
    shipments: true,
    disruptions: true,
    routes: true,
    hubs: true
  });

  function toggleLayer(layer: MapLayerKey) {
    setLayers((current) => ({
      ...current,
      [layer]: !current[layer]
    }));
  }

  return { layers, setLayers, toggleLayer };
}
