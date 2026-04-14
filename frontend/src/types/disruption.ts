import type { ApiPaginationQuery } from './api.ts';

export type DisruptionStatus = 'active' | 'resolved';

export type DisruptionType = 'weather' | 'congestion' | 'blockage' | 'vehicle_issue';

export type DisruptionSource = 'rule_engine' | 'AI' | 'simulator' | 'manual';

export type Disruption = {
  id: string;
  type: DisruptionType | string;
  severity: number;
  status: DisruptionStatus;
  title?: string;
};

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

export type DisruptionListQuery = ApiPaginationQuery & {
  status?: DisruptionStatus;
  type?: DisruptionType;
  source?: DisruptionSource;
  node_id?: string;
  edge_id?: string;
  severity_gte?: number;
  severity_lte?: number;
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

export type ResolveManyDisruptionsResult = {
  resolved: DisruptionRecord[];
  failed: string[];
};

export type DisruptionRealtimeEvent = {
  disruptionId?: string;
  type?: DisruptionType | string;
  severity?: number;
  status?: DisruptionStatus | string;
  reason?: string;
  createdCount?: number;
  [key: string]: unknown;
};
