export type MapLayerKey = 'shipments' | 'disruptions' | 'routes' | 'hubs';

export type MapLayerState = Record<MapLayerKey, boolean>;

export type MapLayerCounts = Partial<Record<MapLayerKey, number>>;

export type MapCoordinateValue = number | string;

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapRoutePoint = [number, number];

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
};

export type RoutePolyline = {
  id: string;
  points: Array<{ lat: number; lng: number }>;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  dashed?: boolean;
};

export type MapShipmentRecord = {
  id: string;
  tracking_number: string;
  status: string;
  priority?: string;
  latitude: MapCoordinateValue;
  longitude: MapCoordinateValue;
};

export type MapDisruptionRecord = {
  id: string;
  type: string;
  severity: number | string;
  status: string;
  title?: string;
  latitude: MapCoordinateValue;
  longitude: MapCoordinateValue;
};

export type MapNodeRecord = {
  id: string;
  name: string;
  type: string;
  city?: string;
  country?: string;
  latitude: MapCoordinateValue;
  longitude: MapCoordinateValue;
};

export type MapDataPayload = {
  shipments: MapShipmentRecord[];
  disruptions: MapDisruptionRecord[];
  nodes: MapNodeRecord[];
};

export type MapShipmentPoint = {
  id: string;
  tracking_number: string;
  status: string;
  priority?: string;
  latitude: number;
  longitude: number;
};

export type MapDisruptionPoint = {
  id: string;
  type: string;
  severity: number;
  status: string;
  title?: string;
  latitude: number;
  longitude: number;
};

export type MapNodePoint = {
  id: string;
  name: string;
  type: string;
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

export type MapRouteSegment = {
  id: string;
  points: MapRoutePoint[];
  risk: number;
  isBlocked: boolean;
};

export type SupplyChainMapProps = {
  layers: MapLayerState;
  shipments: MapShipmentPoint[];
  disruptions: MapDisruptionPoint[];
  nodes: MapNodePoint[];
  routes: MapRouteSegment[];
};
