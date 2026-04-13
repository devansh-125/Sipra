import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import SupplyChainMap from '../map/SupplyChainMap.tsx';
import MapLayerToggles from '../map/MapLayerToggles.tsx';
import MapLegend from '../map/MapLegend.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import EmptyState from '../common/EmptyState.tsx';
import { dashboardApi } from '../../services/api/dashboardApi.ts';
import { apiRequest } from '../../services/api/httpClient.ts';
import { useMapLayers } from '../../hooks/useMapLayers.ts';
import type { ApiResponse } from '../../types/api.ts';
import { POLLING_INTERVAL_MS } from '../../utils/constants.ts';

type MapShipment = {
  id: string;
  tracking_number: string;
  status: string;
  priority?: string;
  latitude: number | string;
  longitude: number | string;
};

type MapDisruption = {
  id: string;
  type: string;
  severity: number | string;
  status: string;
  title?: string;
  latitude: number | string;
  longitude: number | string;
};

type MapNode = {
  id: string;
  name: string;
  type: string;
  city?: string;
  country?: string;
  latitude: number | string;
  longitude: number | string;
};

type MapDataPayload = {
  shipments: MapShipment[];
  disruptions: MapDisruption[];
  nodes: MapNode[];
};

type NetworkEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  current_risk_score?: number | string;
  is_blocked?: boolean;
};

type RouteSegment = {
  id: string;
  points: Array<[number, number]>;
  risk: number;
  isBlocked: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function hasValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  const lat = toNumber(latitude, Number.NaN);
  const lng = toNumber(longitude, Number.NaN);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export default function LargeMapPanel() {
  const { layers, toggleLayer } = useMapLayers();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapDataPayload>({
    shipments: [],
    disruptions: [],
    nodes: []
  });
  const [edges, setEdges] = useState<NetworkEdge[]>([]);

  const loadMapData = useCallback(async () => {
    setError(null);

    try {
      const [mapRes, edgeRes] = await Promise.allSettled([
        dashboardApi.getMapData(350) as Promise<ApiResponse<MapDataPayload>>,
        apiRequest<ApiResponse<NetworkEdge[]>>('/api/network/edges', {
          query: { limit: 350, is_active: true }
        })
      ]);

      if (mapRes.status === 'rejected') {
        throw mapRes.reason;
      }

      const payload = mapRes.value?.data;
      setMapData({
        shipments: payload?.shipments || [],
        disruptions: payload?.disruptions || [],
        nodes: payload?.nodes || []
      });

      if (edgeRes.status === 'fulfilled') {
        setEdges(edgeRes.value?.data || []);
      } else {
        setEdges([]);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load map data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMapData();

    const refreshTimer = window.setInterval(() => {
      void loadMapData();
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(refreshTimer);
  }, [loadMapData]);

  const nodeCoordinateMap = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const node of mapData.nodes) {
      if (hasValidCoordinate(node.latitude, node.longitude)) {
        map.set(node.id, [toNumber(node.latitude), toNumber(node.longitude)]);
      }
    }
    return map;
  }, [mapData.nodes]);

  const normalizedShipments = useMemo(() => {
    return mapData.shipments
      .filter((shipment) => hasValidCoordinate(shipment.latitude, shipment.longitude))
      .map((shipment) => ({
        ...shipment,
        latitude: toNumber(shipment.latitude),
        longitude: toNumber(shipment.longitude)
      }));
  }, [mapData.shipments]);

  const normalizedDisruptions = useMemo(() => {
    return mapData.disruptions
      .filter((disruption) => hasValidCoordinate(disruption.latitude, disruption.longitude))
      .map((disruption) => ({
        ...disruption,
        severity: toNumber(disruption.severity, 1),
        latitude: toNumber(disruption.latitude),
        longitude: toNumber(disruption.longitude)
      }));
  }, [mapData.disruptions]);

  const normalizedNodes = useMemo(() => {
    return mapData.nodes
      .filter((node) => hasValidCoordinate(node.latitude, node.longitude))
      .map((node) => ({
        ...node,
        latitude: toNumber(node.latitude),
        longitude: toNumber(node.longitude)
      }));
  }, [mapData.nodes]);

  const routeSegments = useMemo<RouteSegment[]>(() => {
    return edges
      .map((edge) => {
        const from = nodeCoordinateMap.get(edge.from_node_id);
        const to = nodeCoordinateMap.get(edge.to_node_id);
        if (!from || !to) {
          return null;
        }

        return {
          id: edge.id,
          points: [from, to],
          risk: toNumber(edge.current_risk_score, 0),
          isBlocked: Boolean(edge.is_blocked)
        };
      })
      .filter((segment): segment is RouteSegment => Boolean(segment));
  }, [edges, nodeCoordinateMap]);

  const hasAnyData =
    normalizedShipments.length > 0 ||
    normalizedDisruptions.length > 0 ||
    normalizedNodes.length > 0 ||
    routeSegments.length > 0;

  const layerCounts = {
    shipments: normalizedShipments.length,
    disruptions: normalizedDisruptions.length,
    routes: routeSegments.length,
    hubs: normalizedNodes.length
  };

  return (
    <SectionCard
      title="Network Live Map"
      subtitle="Shipments, routes, disruptions, and hub nodes in one view"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <MapLayerToggles layers={layers} counts={layerCounts} onToggle={toggleLayer} />
          <button
            type="button"
            onClick={() => void loadMapData()}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-slate-500"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="space-y-3">
            <EmptyState label={`Map data error: ${error}`} />
            <button
              type="button"
              onClick={() => void loadMapData()}
              className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
            >
              Retry
            </button>
          </div>
        ) : !hasAnyData ? (
          <EmptyState label="No map coordinates found yet. Seed demo data to visualize network activity." />
        ) : (
          <>
            <SupplyChainMap
              layers={layers}
              shipments={normalizedShipments}
              disruptions={normalizedDisruptions}
              nodes={normalizedNodes}
              routes={routeSegments}
            />
            <MapLegend />
            <p className="text-xs text-slate-400">
              Live entities: {normalizedShipments.length} shipments, {normalizedDisruptions.length} disruptions, {normalizedNodes.length} hubs, {routeSegments.length} routes
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}
