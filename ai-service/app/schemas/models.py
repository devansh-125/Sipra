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


# ── Chat / LLM ───────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(default="")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list, description="Conversation history")
    user_message: str = Field(description="New message from the user")


class ChatActionTaken(BaseModel):
    tool: str
    input: dict = Field(default_factory=dict)
    output: dict | list | str = Field(default="")


class ChatResponse(BaseModel):
    reply: str
    actions_taken: list[ChatActionTaken] = Field(default_factory=list)
    model: str


# ── Narrative / GenAI Insights ───────────────────────────────────

class FleetInsightsRequest(BaseModel):
    shipments: list[dict] = Field(default_factory=list, description="Array of shipment objects with status, delay_probability, etc.")
    summary: dict = Field(default_factory=dict, description="Optional dashboard summary object")


class ShipmentExplainRequest(BaseModel):
    shipment: dict = Field(description="Single shipment object with all fields")


class DisruptionReportRequest(BaseModel):
    type: str = Field(default="weather")
    severity: float = Field(default=5, ge=1, le=10)
    impacted_shipments: int = Field(default=0, ge=0)
    estimated_delay_min: int = Field(default=0, ge=0)
    location: str | None = None
    extra: dict = Field(default_factory=dict, description="Any additional context")


# ── Autonomous Agent ─────────────────────────────────────────────

class AgentAction(BaseModel):
    action_type: str = Field(description="Tool name that was called")
    target_id: str | None = Field(default=None, description="Shipment/disruption/alert ID targeted")
    details: dict = Field(default_factory=dict, description="Arguments passed to the tool")
    result: dict | list | str = Field(default="", description="Tool call result")
    timestamp: str = Field(default="", description="ISO timestamp of action")


class AgentCycleResult(BaseModel):
    observations_summary: str = Field(description="LLM summary of observations and actions taken")
    actions: list[AgentAction] = Field(default_factory=list)
    actions_count: int = Field(default=0)
    started_at: str = Field(default="")
    finished_at: str = Field(default="")
    duration_seconds: float = Field(default=0)
    model: str = Field(default="")
