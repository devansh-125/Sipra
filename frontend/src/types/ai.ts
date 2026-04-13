export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AiModelInfo = {
  name: string;
  version: string;
  source?: string;
};

export type AiFactor = {
  factor: string;
  value: number;
};

export type AiInsight = {
  delay_probability: number;
  predicted_delay_min: number;
  top_factors: AiFactor[];
  model_version: string;
  confidence?: number;
  risk_level?: AiRiskLevel;
  factors?: Record<string, number>;
  model?: AiModelInfo;
};

export type PredictDelayPayload = {
  shipment_id?: string;
  distance_km?: number;
  weather_risk_score?: number;
  traffic_risk_score?: number;
  congestion_score?: number;
  disruptions_count?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical' | string;
  current_eta_minutes?: number;
  use_remote?: boolean;
};

export type PredictDelayResult = {
  delay_probability: number;
  predicted_delay_min: number;
  risk_level: AiRiskLevel;
  factors: Record<string, number>;
  model: AiModelInfo;
};

export type DetectAnomalyPayload = {
  metrics?: Record<string, number>;
  threshold?: number;
  use_remote?: boolean;
};

export type AiAnomalyIndicator = {
  metric: string;
  score: number;
};

export type DetectAnomalyResult = {
  anomaly_score: number;
  threshold: number;
  is_anomaly: boolean;
  top_indicators: AiAnomalyIndicator[];
  model: AiModelInfo;
};

export type AiRouteCandidate = {
  id?: string;
  distance_km?: number;
  estimated_time_min?: number;
  weather_risk?: number;
  traffic_risk?: number;
  disruption_risk?: number;
  cost?: number;
};

export type AiRouteWeights = {
  time?: number;
  distance?: number;
  weather?: number;
  traffic?: number;
  disruption?: number;
  cost?: number;
};

export type ScoreRoutePayload = {
  candidates: AiRouteCandidate[];
  weights?: AiRouteWeights;
  use_remote?: boolean;
};

export type AiRouteScoreBreakdown = {
  time_penalty: number;
  distance_penalty: number;
  weather_penalty: number;
  traffic_penalty: number;
  disruption_penalty: number;
  cost_penalty: number;
  weighted_penalty: number;
};

export type AiScoredRoute = {
  candidate_id: string;
  score: number;
  breakdown: AiRouteScoreBreakdown;
  candidate: AiRouteCandidate;
};

export type ScoreRouteResult = {
  scored_routes: AiScoredRoute[];
  model: AiModelInfo;
};

export type RecommendRoutePayload = ScoreRoutePayload;

export type RecommendRouteResult = {
  recommended_route: AiScoredRoute;
  alternatives: AiScoredRoute[];
  model: AiModelInfo;
};

export type SimulateDisruptionPayload = {
  type?: string;
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
  persist?: boolean;
  use_remote?: boolean;
};

export type SimulatedDisruptionScenario = {
  type: string;
  severity: number;
  node_id: string | null;
  edge_id: string | null;
  latitude: number | null;
  longitude: number | null;
  affected_radius_km: number;
  impacted_shipments_estimate: number;
  estimated_average_delay_min: number;
  generated_at: string;
};

export type PersistedDisruptionSummary = {
  id: string;
  type: string;
  severity: number;
  status?: 'active' | 'resolved' | string;
  title?: string;
  [key: string]: unknown;
};

export type SimulateDisruptionResult = {
  scenario: SimulatedDisruptionScenario;
  persisted_disruption: PersistedDisruptionSummary | null;
  model: AiModelInfo;
};
