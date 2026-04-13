import { apiRequest } from './httpClient.ts';

type AlertListQuery = {
  is_read?: boolean;
  alert_type?: string;
  severity_gte?: number;
  severity_lte?: number;
  shipment_id?: string;
  limit?: number;
  offset?: number;
};

export const alertsApi = {
  list: (query?: AlertListQuery) =>
    apiRequest('/api/alerts', {
      query
    }),
  listByShipment: (shipmentId: string, query?: Pick<AlertListQuery, 'limit' | 'offset'>) =>
    apiRequest(`/api/alerts/shipment/${shipmentId}`, {
      query
    }),
  markRead: (alertId: string) =>
    apiRequest(`/api/alerts/${alertId}/read`, {
      method: 'PATCH'
    })
};
