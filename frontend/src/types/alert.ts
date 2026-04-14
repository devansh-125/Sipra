export type AlertSeverity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type AlertType =
  | 'delay_prediction'
  | 'disruption'
  | 'route_risk'
  | 'eta_change'
  | 'weather'
  | 'traffic'
  | 'operational'
  | 'inventory'
  | string;

export type AlertItem = {
  id: string;
  shipment_id?: string | null;
  disruption_id?: string | null;
  alert_type?: AlertType;
  title: string;
  message?: string;
  severity: number;
  is_read: boolean;
  created_at: string;
  resolved_at?: string | null;
};

export type AlertListQuery = {
  is_read?: boolean;
  alert_type?: AlertType;
  severity_gte?: number;
  severity_lte?: number;
  shipment_id?: string;
  limit?: number;
  offset?: number;
};

export type AlertPagingQuery = Pick<AlertListQuery, 'limit' | 'offset'>;

export type AlertRealtimeEvent = {
  alertId?: string;
  disruptionId?: string;
  shipmentId?: string;
  severity?: number;
  title?: string;
  reason?: string;
  [key: string]: unknown;
};

export type AlertSummary = {
  total: number;
  unread: number;
  critical: number;
};
