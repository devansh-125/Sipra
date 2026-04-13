import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Disruption } from '../../types/disruption.ts';

export type DisruptionStatus = 'active' | 'resolved';
export type DisruptionType = 'weather' | 'congestion' | 'blockage' | 'vehicle_issue';
export type DisruptionSource = 'rule_engine' | 'AI' | 'simulator' | 'manual';

export type DisruptionRecord = Disruption & {
  description?: string | null;
  source?: DisruptionSource | string;
  node_id?: string | null;
  edge_id?: string | null;
  affected_radius_km?: number | string;
  starts_at?: string;
  ends_at?: string | null;
  updated_at?: string;
};

export type DisruptionListQuery = {
  status?: DisruptionStatus;
  type?: DisruptionType;
  source?: DisruptionSource;
  node_id?: string;
  edge_id?: string;
  severity_gte?: number;
  severity_lte?: number;
  limit?: number;
  offset?: number;
};

export type SimulateDisruptionPayload = {
  type?: DisruptionType;
  severity?: number;
  node_id?: string;
  edge_id?: string;
  latitude?: number;
  longitude?: number;
  affected_radius_km?: number;
  starts_at?: string;
  ends_at?: string;
  title?: string;
  description?: string;
  source?: DisruptionSource;
};

export type DetectDisruptionPayload = {
  threshold?: number;
  limit?: number;
};

export type ResolveDisruptionPayload = {
  ends_at?: string;
  resolution_note?: string;
};

export type DetectDisruptionResponse = {
  threshold: number;
  inspected_edges: number;
  created_count: number;
  disruptions: DisruptionRecord[];
};

function toInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toFloat(value: unknown): number | undefined {
  const parsed = Number.parseFloat(String(value));
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

function sanitizeListQuery(query?: DisruptionListQuery): DisruptionListQuery | undefined {
  if (!query) {
    return undefined;
  }

  const severityGte = toInt(query.severity_gte);
  const severityLte = toInt(query.severity_lte);
  const limit = toInt(query.limit);
  const offset = toInt(query.offset);

  return {
    status: query.status,
    type: query.type,
    source: query.source,
    node_id: toCleanString(query.node_id),
    edge_id: toCleanString(query.edge_id),
    severity_gte: severityGte == null ? undefined : clamp(severityGte, 1, 10),
    severity_lte: severityLte == null ? undefined : clamp(severityLte, 1, 10),
    limit: limit == null ? undefined : clamp(limit, 1, 500),
    offset: offset == null ? undefined : Math.max(0, offset)
  };
}

function sanitizeSimulatePayload(payload: SimulateDisruptionPayload): SimulateDisruptionPayload {
  const severity = toFloat(payload.severity);
  const radius = toFloat(payload.affected_radius_km);
  const latitude = toFloat(payload.latitude);
  const longitude = toFloat(payload.longitude);

  return {
    ...payload,
    node_id: toCleanString(payload.node_id),
    edge_id: toCleanString(payload.edge_id),
    title: toCleanString(payload.title),
    description: toCleanString(payload.description),
    starts_at: toCleanString(payload.starts_at),
    ends_at: toCleanString(payload.ends_at),
    severity: severity == null ? undefined : clamp(Math.round(severity), 1, 10),
    affected_radius_km: radius == null ? undefined : Math.max(0, radius),
    latitude,
    longitude
  };
}

function sanitizeDetectPayload(payload?: DetectDisruptionPayload): DetectDisruptionPayload {
  const threshold = toFloat(payload?.threshold);
  const limit = toInt(payload?.limit);

  return {
    threshold: threshold == null ? undefined : clamp(threshold, 0, 1),
    limit: limit == null ? undefined : clamp(limit, 1, 20)
  };
}

export const disruptionsApi = {
  list: (query?: DisruptionListQuery) =>
    apiRequest<ApiResponse<DisruptionRecord[]>>('/api/disruptions', {
      query: sanitizeListQuery(query)
    }),
  listActive: (query?: Omit<DisruptionListQuery, 'status'>) =>
    apiRequest<ApiResponse<DisruptionRecord[]>>('/api/disruptions', {
      query: sanitizeListQuery({
        ...query,
        status: 'active'
      })
    }),
  simulate: (payload: SimulateDisruptionPayload) =>
    apiRequest<ApiResponse<DisruptionRecord>>('/api/disruptions/simulate', {
      method: 'POST',
      body: JSON.stringify(sanitizeSimulatePayload(payload))
    }),
  detect: (payload?: DetectDisruptionPayload) =>
    apiRequest<ApiResponse<DetectDisruptionResponse>>('/api/disruptions/detect', {
      method: 'POST',
      body: JSON.stringify(sanitizeDetectPayload(payload))
    }),
  resolve: (disruptionId: string, payload?: ResolveDisruptionPayload) =>
    apiRequest<ApiResponse<DisruptionRecord>>(`/api/disruptions/${encodeURIComponent(disruptionId)}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {})
    }),
  resolveMany: async (disruptionIds: string[], payload?: ResolveDisruptionPayload) => {
    const uniqueIds = Array.from(
      new Set(disruptionIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
    );

    const settled = await Promise.allSettled(
      uniqueIds.map(async (disruptionId) => {
        const response = await disruptionsApi.resolve(disruptionId, payload);
        return response.data;
      })
    );

    return {
      resolved: settled
        .filter((item): item is PromiseFulfilledResult<DisruptionRecord> => item.status === 'fulfilled')
        .map((item) => item.value),
      failed: settled
        .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
        .map((item) => String(item.reason))
    };
  }
};

export const disruptionApi = disruptionsApi;
