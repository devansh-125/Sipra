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
