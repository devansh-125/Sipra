import { useState } from 'react';

export function useMapLayers() {
  const [layers, setLayers] = useState({
    shipments: true,
    disruptions: true,
    routes: true,
    hubs: true
  });

  return { layers, setLayers };
}
