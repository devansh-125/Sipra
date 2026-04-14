export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export type LiveBadgeCounts = {
  alerts: number;
  disruptions: number;
  delayedShipments: number;
};

export type RealtimeSocketLifecycleEvent =
  | 'socket:connect'
  | 'socket:disconnect'
  | 'socket:connect_error';

export type RealtimeDomainEvent =
  | 'shipment:updated'
  | 'shipment:rerouted'
  | 'shipment:delayed'
  | 'shipment:delivered'
  | 'alert:new'
  | 'disruption:new'
  | 'disruption:resolved'
  | 'dashboard:refresh';

export type RealtimeKnownEventName = RealtimeSocketLifecycleEvent | RealtimeDomainEvent;

export type RealtimeEventName = RealtimeKnownEventName | string;

export type RealtimeSocketConnectPayload = {
  id?: string;
};

export type RealtimeSocketDisconnectPayload = {
  reason?: string;
};

export type RealtimeSocketErrorPayload = {
  message?: string;
};

export type RealtimeShipmentEventPayload = {
  shipmentId?: string;
  shipment_id?: string;
  status?: string;
  [key: string]: unknown;
};

export type RealtimeAlertEventPayload = {
  alertId?: string;
  disruptionId?: string;
  shipmentId?: string;
  severity?: number;
  title?: string;
  [key: string]: unknown;
};

export type RealtimeDisruptionEventPayload = {
  disruptionId?: string;
  type?: string;
  severity?: number;
  status?: string;
  [key: string]: unknown;
};

export type RealtimeDashboardRefreshPayload = {
  reason?: string;
  disruptionId?: string;
  alertId?: string;
  createdCount?: number;
  [key: string]: unknown;
};

export type RealtimeEventPayloadMap = {
  'socket:connect': RealtimeSocketConnectPayload;
  'socket:disconnect': RealtimeSocketDisconnectPayload;
  'socket:connect_error': RealtimeSocketErrorPayload;
  'shipment:updated': RealtimeShipmentEventPayload;
  'shipment:rerouted': RealtimeShipmentEventPayload;
  'shipment:delayed': RealtimeShipmentEventPayload;
  'shipment:delivered': RealtimeShipmentEventPayload;
  'alert:new': RealtimeAlertEventPayload;
  'disruption:new': RealtimeDisruptionEventPayload;
  'disruption:resolved': RealtimeDisruptionEventPayload;
  'dashboard:refresh': RealtimeDashboardRefreshPayload;
};

export type RealtimeEventHandler = (payload: unknown) => void;

export type UseRealtimeOptions = {
  autoConnect?: boolean;
  namespace?: string;
};

export type RealtimeConnectionSnapshot = {
  connectionState: RealtimeConnectionState;
  isConnected: boolean;
  socketId: string | null;
  transport: string | null;
  lastEventName: string | null;
  lastEventAt: string | null;
  lastError: string | null;
};

export type RealtimeSocketClient = {
  on: (eventName: RealtimeEventName, handler: RealtimeEventHandler) => () => void;
  once: (eventName: RealtimeEventName, handler: RealtimeEventHandler) => () => void;
  off: (eventName: RealtimeEventName, handler: RealtimeEventHandler) => void;
  offAll: (eventName?: RealtimeEventName) => void;
  emitLocal: (eventName: RealtimeEventName, payload: unknown) => void;
  listenerCount: (eventName: RealtimeEventName) => number;
  eventNames: () => string[];
  clear: () => void;
};

export type UseRealtimeResult = {
  on: (eventName: RealtimeEventName, handler: RealtimeEventHandler) => void;
  off: (eventName: RealtimeEventName, handler: RealtimeEventHandler) => void;
  emitLocal: (eventName: RealtimeEventName, payload: unknown) => void;
  emit: (eventName: RealtimeEventName, payload: unknown) => void;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
} & RealtimeConnectionSnapshot;
