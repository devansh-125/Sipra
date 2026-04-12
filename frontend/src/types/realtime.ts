export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export type LiveBadgeCounts = {
  alerts: number;
  disruptions: number;
  delayedShipments: number;
};
