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
