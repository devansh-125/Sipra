"""
Pydantic request/response models matching backend TypeScript types.
"""

from __future__ import annotations
from pydantic import BaseModel, Field


# ── Delay Prediction ──────────────────────────────────────────────

class PredictDelayRequest(BaseModel):
    shipment_id: str | None = None
    distance_km: float = Field(default=150, ge=0)
    weather_risk_score: float = Field(default=0.2, ge=0, le=1)
    traffic_risk_score: float = Field(default=0.25, ge=0, le=1)
    congestion_score: float = Field(default=0.2, ge=0, le=1)
    disruptions_count: int = Field(default=0, ge=0)
    priority: str = Field(default="medium")
    current_eta_minutes: float | None = None
    use_remote: bool | None = None


class DelayModelInfo(BaseModel):
    name: str
    version: str
    source: str


class PredictDelayResponse(BaseModel):
    delay_probability: float
    predicted_delay_min: int
    risk_level: str
    factors: dict[str, float]
    model: DelayModelInfo


# ── Anomaly Detection ─────────────────────────────────────────────

class DetectAnomalyRequest(BaseModel):
    metrics: dict[str, float] = Field(default_factory=dict)
    threshold: float = Field(default=0.7, ge=0, le=1)
    use_remote: bool | None = None


class AnomalyIndicator(BaseModel):
    metric: str
    score: float


class AnomalyModelInfo(BaseModel):
    name: str
    version: str
    source: str


class DetectAnomalyResponse(BaseModel):
    anomaly_score: float
    threshold: float
    is_anomaly: bool
    top_indicators: list[AnomalyIndicator]
    model: AnomalyModelInfo


# ── Route Scoring ────────────────────────────────────────────────

class RouteCandidate(BaseModel):
    id: str | None = None
    distance_km: float = Field(default=150, ge=0)
    estimated_time_min: float = Field(default=200, ge=0)
    weather_risk: float = Field(default=0.2, ge=0, le=1)
    traffic_risk: float = Field(default=0.25, ge=0, le=1)
    disruption_risk: float = Field(default=0.1, ge=0, le=1)
    cost: float = Field(default=500, ge=0)


class RouteWeights(BaseModel):
    time: float = 0.30
    distance: float = 0.20
    weather: float = 0.15
    traffic: float = 0.15
    disruption: float = 0.15
    cost: float = 0.05


class ScoreRouteRequest(BaseModel):
    candidates: list[RouteCandidate] = Field(default_factory=list)
    weights: RouteWeights | None = None
    use_remote: bool | None = None


class RouteBreakdown(BaseModel):
    time_penalty: float
    distance_penalty: float
    weather_penalty: float
    traffic_penalty: float
    disruption_penalty: float
    cost_penalty: float
    weighted_penalty: float


class RouteModelInfo(BaseModel):
    name: str
    version: str
    source: str


class ScoredRoute(BaseModel):
    candidate_id: str
    score: float
    breakdown: RouteBreakdown
    candidate: RouteCandidate


class ScoreRouteResponse(BaseModel):
    scored_routes: list[ScoredRoute]
    model: RouteModelInfo


class RecommendRouteResponse(BaseModel):
    recommended_route: ScoredRoute
    alternatives: list[ScoredRoute]
    model: RouteModelInfo


# ── Disruption Simulation ────────────────────────────────────────

class SimulateDisruptionRequest(BaseModel):
    type: str = Field(default="weather")
    severity: float = Field(default=7, ge=1, le=10)
    node_id: str | None = None
    edge_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    affected_radius_km: float = Field(default=20, ge=0)
    starts_at: str | None = None
    ends_at: str | None = None
    title: str | None = None
    description: str | None = None
    persist: bool | None = None
    hour: float | None = Field(default=None, ge=0, le=23)
    use_remote: bool | None = None


class DisruptionScenario(BaseModel):
    type: str
    severity: int
    node_id: str | None
    edge_id: str | None
    latitude: float | None
    longitude: float | None
    affected_radius_km: float
    impacted_shipments_estimate: int
    estimated_average_delay_min: int
    generated_at: str


class SimulationModelInfo(BaseModel):
    name: str
    version: str
    source: str


class SimulateDisruptionResponse(BaseModel):
    scenario: DisruptionScenario
    persisted_disruption: dict | None = None
    model: SimulationModelInfo
