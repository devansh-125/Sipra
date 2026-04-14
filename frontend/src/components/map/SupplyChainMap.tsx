import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Polyline,
  Circle,
  Marker,
  InfoWindow,
  TrafficLayer
} from '@react-google-maps/api';
import type { SupplyChainMapProps } from '../../types/map.ts';
import { MAP_COLORS } from '../../utils/constants.ts';
import ShipmentPopupCard from './ShipmentPopupCard.tsx';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 22.9734, lng: 78.6569 };

const darkMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] }
];

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

type ActiveInfoWindow = {
  position: google.maps.LatLngLiteral;
  content: React.ReactNode;
} | null;

export default function SupplyChainMap({ layers, shipments, disruptions, nodes, routes }: SupplyChainMapProps) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeInfo, setActiveInfo] = useState<ActiveInfoWindow>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const bounds = new google.maps.LatLngBounds();
    let count = 0;

    if (layers.shipments) {
      for (const s of shipments) {
        bounds.extend({ lat: s.latitude, lng: s.longitude });
        count++;
      }
    }
    if (layers.disruptions) {
      for (const d of disruptions) {
        bounds.extend({ lat: d.latitude, lng: d.longitude });
        count++;
      }
    }
    if (layers.hubs) {
      for (const n of nodes) {
        bounds.extend({ lat: n.latitude, lng: n.longitude });
        count++;
      }
    }
    if (layers.routes) {
      for (const r of routes) {
        for (const [lat, lng] of r.points) {
          bounds.extend({ lat, lng });
          count++;
        }
      }
    }

    if (count > 0) {
      map.fitBounds(bounds, 28);
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 8) map.setZoom(8);
      });
    }
  }, [mapReady, layers, shipments, disruptions, nodes, routes]);

  if (!isLoaded) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60">
        <p className="text-sm text-slate-400">Loading Google Maps…</p>
      </div>
    );
  }

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-slate-800">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={defaultCenter}
        zoom={5}
        onLoad={onMapLoad}
        onClick={() => setActiveInfo(null)}
        options={{
          styles: darkMapStyles,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        }}
      >
        <TrafficLayer />

        {layers.routes &&
          routes.map((route) => {
            const path = route.points.map(([lat, lng]) => ({ lat, lng }));
            const color = toColorByRisk(route.risk, route.isBlocked);
            return (
              <Polyline
                key={route.id}
                path={path}
                options={{
                  strokeColor: color,
                  strokeWeight: 4,
                  strokeOpacity: route.isBlocked ? 0 : 0.75,
                  ...(route.isBlocked && {
                    icons: [
                      {
                        icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.75, strokeColor: color, scale: 4 },
                        offset: '0',
                        repeat: '12px'
                      }
                    ]
                  })
                }}
                onClick={() =>
                  setActiveInfo({
                    position: path[0],
                    content: (
                      <div className="text-xs text-slate-200">
                        <p className="font-semibold">Route {route.id.slice(0, 8)}</p>
                        <p>Risk: {Math.round(route.risk * 100)}%</p>
                        <p>Status: {route.isBlocked ? 'Blocked' : 'Active'}</p>
                      </div>
                    )
                  })
                }
              />
            );
          })}

        {layers.shipments &&
          shipments.map((shipment) => (
            <Marker
              key={shipment.id}
              position={{ lat: shipment.latitude, lng: shipment.longitude }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: toColorByStatus(shipment.status),
                fillOpacity: 0.85,
                strokeColor: toColorByStatus(shipment.status),
                strokeWeight: 2
              }}
              onClick={() =>
                setActiveInfo({
                  position: { lat: shipment.latitude, lng: shipment.longitude },
                  content: (
                    <ShipmentPopupCard
                      trackingNumber={shipment.tracking_number}
                      status={shipment.status}
                      priority={shipment.priority}
                      locationLabel={`${shipment.latitude.toFixed(2)}, ${shipment.longitude.toFixed(2)}`}
                      riskLabel={riskLabelFromShipmentStatus(shipment.status)}
                    />
                  )
                })
              }
            />
          ))}

        {layers.disruptions &&
          disruptions.map((disruption) => (
            <Circle
              key={disruption.id}
              center={{ lat: disruption.latitude, lng: disruption.longitude }}
              radius={Math.max(8000, disruption.severity * 5000)}
              options={{
                strokeColor: MAP_COLORS.delayed,
                fillColor: MAP_COLORS.delayed,
                fillOpacity: 0.16,
                strokeWeight: 1
              }}
              onClick={() =>
                setActiveInfo({
                  position: { lat: disruption.latitude, lng: disruption.longitude },
                  content: (
                    <div className="text-xs text-slate-200">
                      <p className="font-semibold">{disruption.title || disruption.type}</p>
                      <p>Severity: {disruption.severity}</p>
                      <p>Status: {disruption.status}</p>
                    </div>
                  )
                })
              }
            />
          ))}

        {layers.hubs &&
          nodes.map((node) => (
            <Marker
              key={node.id}
              position={{ lat: node.latitude, lng: node.longitude }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: '#94a3b8',
                fillOpacity: 0.75,
                strokeColor: '#cbd5e1',
                strokeWeight: 2
              }}
              onClick={() =>
                setActiveInfo({
                  position: { lat: node.latitude, lng: node.longitude },
                  content: (
                    <div className="text-xs text-slate-200">
                      <p className="font-semibold">{node.name}</p>
                      <p>{node.type}</p>
                      <p>{node.city || 'Unknown city'}</p>
                    </div>
                  )
                })
              }
            />
          ))}

        {activeInfo && (
          <InfoWindow position={activeInfo.position} onCloseClick={() => setActiveInfo(null)}>
            <div>{activeInfo.content}</div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
