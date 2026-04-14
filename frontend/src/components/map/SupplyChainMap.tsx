import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SupplyChainMapProps } from '../../types/map.ts';
import { MAP_COLORS } from '../../utils/constants.ts';
import ShipmentPopupCard from './ShipmentPopupCard.tsx';

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const defaultCenter: [number, number] = [22.9734, 78.6569];

function toColorByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'delayed') return MAP_COLORS.delayed;
  if (normalized === 'in_transit') return MAP_COLORS.rerouted;
  if (normalized === 'pending') return MAP_COLORS.warning;
  return MAP_COLORS.healthy;
}

function toColorByRisk(risk: number, isBlocked: boolean): string {
  if (isBlocked || risk >= 0.66) return MAP_COLORS.delayed;
  if (risk >= 0.33) return MAP_COLORS.warning;
  return MAP_COLORS.rerouted;
}

function riskLabelFromShipmentStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'delayed') return 'High';
  if (normalized === 'pending') return 'Medium';
  return 'Low';
}

/** Auto-fits the map to visible data whenever layers/data change. */
function FitBoundsController({ layers, shipments, disruptions, nodes, routes }: SupplyChainMapProps) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    if (layers.shipments) {
      for (const s of shipments) points.push([s.latitude, s.longitude]);
    }
    if (layers.disruptions) {
      for (const d of disruptions) points.push([d.latitude, d.longitude]);
    }
    if (layers.hubs) {
      for (const n of nodes) points.push([n.latitude, n.longitude]);
    }
    if (layers.routes) {
      for (const r of routes) {
        for (const [lat, lng] of r.points) points.push([lat, lng]);
      }
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
    }
  }, [map, layers, shipments, disruptions, nodes, routes]);

  return null;
}

export default function SupplyChainMap({ layers, shipments, disruptions, nodes, routes }: SupplyChainMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  const validRoutes = useMemo(
    () =>
      routes
        .map((route) => ({
          ...route,
          latLngs: route.points
            .map(([lat, lng]) => [lat, lng] as [number, number])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
        }))
        .filter((r) => r.latLngs.length >= 2),
    [routes]
  );

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-slate-800">
      <MapContainer
        center={defaultCenter}
        zoom={5}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
        className="h-full w-full"
        ref={mapRef}
      >
        <TileLayer url={DARK_TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBoundsController
          layers={layers}
          shipments={shipments}
          disruptions={disruptions}
          nodes={nodes}
          routes={routes}
        />

        {/* Route polylines */}
        {layers.routes &&
          validRoutes.map((route) => {
            const color = toColorByRisk(route.risk, route.isBlocked);
            return (
              <Polyline
                key={route.id}
                positions={route.latLngs}
                pathOptions={{
                  color,
                  weight: 4,
                  opacity: 0.75,
                  dashArray: route.isBlocked ? '8 10' : undefined
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">Route {route.id.slice(0, 8)}</p>
                    <p>Risk: {Math.round(route.risk * 100)}%</p>
                    <p>Status: {route.isBlocked ? 'Blocked' : 'Active'}</p>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* Shipment markers */}
        {layers.shipments &&
          shipments.map((shipment) => (
            <CircleMarker
              key={shipment.id}
              center={[shipment.latitude, shipment.longitude]}
              radius={8}
              pathOptions={{
                fillColor: toColorByStatus(shipment.status),
                fillOpacity: 0.85,
                color: toColorByStatus(shipment.status),
                weight: 2
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

        {/* Disruption circles */}
        {layers.disruptions &&
          disruptions.map((disruption) => (
            <Circle
              key={disruption.id}
              center={[disruption.latitude, disruption.longitude]}
              radius={Math.max(8000, disruption.severity * 5000)}
              pathOptions={{
                color: MAP_COLORS.delayed,
                fillColor: MAP_COLORS.delayed,
                fillOpacity: 0.16,
                weight: 1
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{disruption.title || disruption.type}</p>
                  <p>Severity: {disruption.severity}</p>
                  <p>Status: {disruption.status}</p>
                </div>
              </Popup>
            </Circle>
          ))}

        {/* Hub node markers */}
        {layers.hubs &&
          nodes.map((node) => (
            <CircleMarker
              key={node.id}
              center={[node.latitude, node.longitude]}
              radius={6}
              pathOptions={{
                fillColor: '#94a3b8',
                fillOpacity: 0.75,
                color: '#cbd5e1',
                weight: 2
              }}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{node.name}</p>
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
