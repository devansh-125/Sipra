import { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { MapLayerState } from '../../hooks/useMapLayers.ts';
import { MAP_COLORS } from '../../utils/constants.ts';
import ShipmentPopupCard from './ShipmentPopupCard.tsx';

type ShipmentPoint = {
  id: string;
  tracking_number: string;
  status: string;
  priority?: string;
  latitude: number;
  longitude: number;
};

type DisruptionPoint = {
  id: string;
  type: string;
  severity: number;
  status: string;
  title?: string;
  latitude: number;
  longitude: number;
};

type NodePoint = {
  id: string;
  name: string;
  type: string;
  city?: string;
  latitude: number;
  longitude: number;
};

type RouteSegment = {
  id: string;
  points: Array<[number, number]>;
  risk: number;
  isBlocked: boolean;
};

type SupplyChainMapProps = {
  layers: MapLayerState;
  shipments: ShipmentPoint[];
  disruptions: DisruptionPoint[];
  nodes: NodePoint[];
  routes: RouteSegment[];
};

function toColorByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'delayed') {
    return MAP_COLORS.delayed;
  }
  if (normalized === 'in_transit') {
    return MAP_COLORS.rerouted;
  }
  if (normalized === 'pending') {
    return MAP_COLORS.warning;
  }
  return MAP_COLORS.healthy;
}

function toColorByRisk(risk: number, isBlocked: boolean): string {
  if (isBlocked || risk >= 0.66) {
    return MAP_COLORS.delayed;
  }
  if (risk >= 0.33) {
    return MAP_COLORS.warning;
  }
  return MAP_COLORS.rerouted;
}

function riskLabelFromShipmentStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'delayed') {
    return 'High';
  }
  if (normalized === 'pending') {
    return 'Medium';
  }
  return 'Low';
}

function FitToData({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    const bounds = points as LatLngBoundsExpression;
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
  }, [map, points]);

  return null;
}

export default function SupplyChainMap({ layers, shipments, disruptions, nodes, routes }: SupplyChainMapProps) {
  const focusPoints = useMemo(() => {
    const points: Array<[number, number]> = [];

    if (layers.shipments) {
      points.push(...shipments.map((shipment) => [shipment.latitude, shipment.longitude] as [number, number]));
    }

    if (layers.disruptions) {
      points.push(...disruptions.map((disruption) => [disruption.latitude, disruption.longitude] as [number, number]));
    }

    if (layers.hubs) {
      points.push(...nodes.map((node) => [node.latitude, node.longitude] as [number, number]));
    }

    if (layers.routes) {
      for (const route of routes) {
        points.push(...route.points);
      }
    }

    return points;
  }, [disruptions, layers, nodes, routes, shipments]);

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-slate-800">
      <MapContainer center={[22.9734, 78.6569]} zoom={5} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToData points={focusPoints} />

        {layers.routes &&
          routes.map((route) => (
            <Polyline
              key={route.id}
              positions={route.points}
              pathOptions={{
                color: toColorByRisk(route.risk, route.isBlocked),
                weight: 4,
                opacity: 0.75,
                dashArray: route.isBlocked ? '6 6' : undefined
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p><strong>Route {route.id.slice(0, 8)}</strong></p>
                  <p>Risk: {Math.round(route.risk * 100)}%</p>
                  <p>Status: {route.isBlocked ? 'Blocked' : 'Active'}</p>
                </div>
              </Popup>
            </Polyline>
          ))}

        {layers.shipments &&
          shipments.map((shipment) => (
            <CircleMarker
              key={shipment.id}
              center={[shipment.latitude, shipment.longitude]}
              radius={7}
              pathOptions={{
                color: toColorByStatus(shipment.status),
                fillColor: toColorByStatus(shipment.status),
                fillOpacity: 0.8
              }}
            >
              <Popup>
                <ShipmentPopupCard
                  trackingNumber={shipment.tracking_number}
                  status={shipment.status}
                  priority={shipment.priority}
                  locationLabel={`${shipment.latitude.toFixed(2)}, ${shipment.longitude.toFixed(2)}`}
                  riskLabel={riskLabelFromShipmentStatus(shipment.status)}
                />
              </Popup>
            </CircleMarker>
          ))}

        {layers.disruptions &&
          disruptions.map((disruption) => (
            <Circle
              key={disruption.id}
              center={[disruption.latitude, disruption.longitude]}
              radius={Math.max(8000, disruption.severity * 5000)}
              pathOptions={{
                color: MAP_COLORS.delayed,
                fillColor: MAP_COLORS.delayed,
                fillOpacity: 0.16
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p><strong>{disruption.title || disruption.type}</strong></p>
                  <p>Severity: {disruption.severity}</p>
                  <p>Status: {disruption.status}</p>
                </div>
              </Popup>
            </Circle>
          ))}

        {layers.hubs &&
          nodes.map((node) => (
            <CircleMarker
              key={node.id}
              center={[node.latitude, node.longitude]}
              radius={5}
              pathOptions={{
                color: '#cbd5e1',
                fillColor: '#94a3b8',
                fillOpacity: 0.75
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p><strong>{node.name}</strong></p>
                  <p>{node.type}</p>
                  <p>{node.city || 'Unknown city'}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>
    </div>
  );
}
