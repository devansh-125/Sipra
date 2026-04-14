import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapLayerKey, MapLayerState } from '../types/map.ts';
import { DEFAULT_MAP_LAYERS } from '../utils/constants.ts';

export type { MapLayerKey, MapLayerState };

type UseMapLayersOptions = {
  initialLayers?: Partial<MapLayerState>;
  storageKey?: string;
  persist?: boolean;
};

function mergeWithDefaults(partial?: Partial<MapLayerState>): MapLayerState {
  return {
    ...DEFAULT_MAP_LAYERS,
    ...(partial || {})
  };
}

function isMapLayerState(value: unknown): value is MapLayerState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MapLayerState>;
  return (
    typeof candidate.shipments === 'boolean' &&
    typeof candidate.disruptions === 'boolean' &&
    typeof candidate.routes === 'boolean' &&
    typeof candidate.hubs === 'boolean'
  );
}

function readPersistedLayers(storageKey: string): MapLayerState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isMapLayerState(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function useMapLayers(options: UseMapLayersOptions = {}) {
  const { initialLayers, storageKey = 'supply-chain.map-layers', persist = true } = options;

  const [layers, setLayers] = useState<MapLayerState>(() => {
    const mergedInitial = mergeWithDefaults(initialLayers);
    if (!persist) {
      return mergedInitial;
    }

    const persisted = readPersistedLayers(storageKey);
    return persisted || mergedInitial;
  });

  useEffect(() => {
    if (!persist || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(layers));
  }, [layers, persist, storageKey]);

  const toggleLayer = useCallback((layer: MapLayerKey) => {
    setLayers((current) => ({
      ...current,
      [layer]: !current[layer]
    }));
  }, []);

  const setLayerVisibility = useCallback((layer: MapLayerKey, isVisible: boolean) => {
    setLayers((current) => ({
      ...current,
      [layer]: isVisible
    }));
  }, []);

  const enableAllLayers = useCallback(() => {
    setLayers(mergeWithDefaults());
  }, []);

  const disableAllLayers = useCallback(() => {
    setLayers({
      shipments: false,
      disruptions: false,
      routes: false,
      hubs: false
    });
  }, []);

  const resetLayers = useCallback(() => {
    setLayers(mergeWithDefaults(initialLayers));
  }, [initialLayers]);

  const visibleLayerCount = useMemo(() => {
    return Object.values(layers).filter(Boolean).length;
  }, [layers]);

  const allVisible = visibleLayerCount === 4;
  const noneVisible = visibleLayerCount === 0;

  return {
    layers,
    setLayers,
    toggleLayer,
    setLayerVisibility,
    enableAllLayers,
    disableAllLayers,
    resetLayers,
    visibleLayerCount,
    allVisible,
    noneVisible
  };
}
