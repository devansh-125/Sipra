import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { AlertItem, AlertListQuery, AlertPagingQuery } from '../../types/alert.ts';

function toInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeListQuery(query?: AlertListQuery): AlertListQuery | undefined {
  if (!query) {
    return undefined;
  }

  const limit = toInt(query.limit);
  const offset = toInt(query.offset);
  const severityGte = toInt(query.severity_gte);
  const severityLte = toInt(query.severity_lte);

  const normalized: AlertListQuery = {
    is_read: typeof query.is_read === 'boolean' ? query.is_read : undefined,
    alert_type: toCleanString(query.alert_type),
    shipment_id: toCleanString(query.shipment_id),
    severity_gte: severityGte == null ? undefined : clamp(severityGte, 1, 10),
    severity_lte: severityLte == null ? undefined : clamp(severityLte, 1, 10),
    limit: limit == null ? undefined : clamp(limit, 1, 500),
    offset: offset == null ? undefined : Math.max(0, offset)
  };

  return normalized;
}

export const alertsApi = {
  list: (query?: AlertListQuery) =>
    apiRequest<ApiResponse<AlertItem[]>>('/api/alerts', {
      query: sanitizeListQuery(query)
    }),
  listUnread: (query?: Omit<AlertListQuery, 'is_read'>) =>
    apiRequest<ApiResponse<AlertItem[]>>('/api/alerts', {
      query: sanitizeListQuery({
        ...query,
        is_read: false
      })
    }),
  listCritical: (minSeverity = 8, query?: Omit<AlertListQuery, 'severity_gte'>) =>
    apiRequest<ApiResponse<AlertItem[]>>('/api/alerts', {
      query: sanitizeListQuery({
        ...query,
        severity_gte: clamp(Math.round(minSeverity), 1, 10)
      })
    }),
  listByShipment: (shipmentId: string, query?: AlertPagingQuery) =>
    apiRequest<ApiResponse<AlertItem[]>>(`/api/alerts/shipment/${encodeURIComponent(shipmentId)}`, {
      query: sanitizeListQuery(query)
    }),
  markRead: (alertId: string) =>
    apiRequest<ApiResponse<AlertItem>>(`/api/alerts/${encodeURIComponent(alertId)}/read`, {
      method: 'PATCH'
    }),
  markManyRead: async (alertIds: string[]) => {
    const uniqueIds = Array.from(new Set(alertIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    const results = await Promise.all(uniqueIds.map((alertId) => alertsApi.markRead(alertId)));
    return results.map((item) => item.data).filter(Boolean);
  }
};
