"""
Route Scoring Service
======================
Loads trained route_score_regressor.joblib and exposes
score_routes() and recommend_route().

The backend sends a batch of candidates; we score each one individually
with the ML model, then sort by score descending.
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np

from app.schemas.models import (
    ScoreRouteRequest,
    ScoreRouteResponse,
    RecommendRouteResponse,
    ScoredRoute,
    RouteBreakdown,
    RouteModelInfo,
    RouteWeights,
)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_VERSION = "v1"
MODEL_NAME = "ml-route-scorer"

_regressor = None

# Absolute normalisation bounds (same as training generate_data.py)
MAX_DISTANCE = 3000.0
MAX_TIME = 4000.0
MAX_COST = 10000.0

FEATURE_COLS = [
    "distance_km",
    "estimated_time_min",
    "weather_risk",
    "traffic_risk",
    "disruption_risk",
    "cost",
]


def load_route_models() -> None:
    """Load route model from disk. Called once at FastAPI startup."""
    global _regressor

    path = MODEL_DIR / "route_score_regressor.joblib"
    if not path.exists():
        raise FileNotFoundError(f"Route model not found: {path}")

    _regressor = joblib.load(path)
    print(f"[route] Loaded route model from {MODEL_DIR}")


def _normalise_weights(w: RouteWeights) -> dict[str, float]:
    total = w.time + w.distance + w.weather + w.traffic + w.disruption + w.cost
    if total <= 0:
        total = 1.0
    return {
        "time": w.time / total,
        "distance": w.distance / total,
        "weather": w.weather / total,
        "traffic": w.traffic / total,
        "disruption": w.disruption / total,
        "cost": w.cost / total,
    }


def score_routes(req: ScoreRouteRequest) -> ScoreRouteResponse:
    """Score a batch of route candidates."""
    if _regressor is None:
        raise RuntimeError("Route model not loaded. Call load_route_models() first.")

    if not req.candidates:
        raise ValueError("candidates array is required")

    weights = req.weights or RouteWeights()
    nw = _normalise_weights(weights)

    model_info = RouteModelInfo(
        name=MODEL_NAME,
        version=MODEL_VERSION,
        source="python-ml",
    )

    scored: list[ScoredRoute] = []

    for idx, c in enumerate(req.candidates):
        features = np.array([[
            c.distance_km,
            c.estimated_time_min,
            c.weather_risk,
            c.traffic_risk,
            c.disruption_risk,
            c.cost,
        ]])

        ml_score = float(np.clip(_regressor.predict(features)[0], 0.0, 1.0))

        # Compute penalty breakdown (matches backend logic)
        time_p = min(c.estimated_time_min / MAX_TIME, 1.0)
        dist_p = min(c.distance_km / MAX_DISTANCE, 1.0)
        weather_p = min(max(c.weather_risk, 0.0), 1.0)
        traffic_p = min(max(c.traffic_risk, 0.0), 1.0)
        disruption_p = min(max(c.disruption_risk, 0.0), 1.0)
        cost_p = min(c.cost / MAX_COST, 1.0)

        weighted_p = (
            time_p * nw["time"]
            + dist_p * nw["distance"]
            + weather_p * nw["weather"]
            + traffic_p * nw["traffic"]
            + disruption_p * nw["disruption"]
            + cost_p * nw["cost"]
        )

        scored.append(ScoredRoute(
            candidate_id=c.id or f"candidate_{idx + 1}",
            score=round(ml_score, 4),
            breakdown=RouteBreakdown(
                time_penalty=round(time_p, 4),
                distance_penalty=round(dist_p, 4),
                weather_penalty=round(weather_p, 4),
                traffic_penalty=round(traffic_p, 4),
                disruption_penalty=round(disruption_p, 4),
                cost_penalty=round(cost_p, 4),
                weighted_penalty=round(weighted_p, 4),
            ),
            candidate=c,
        ))

    scored.sort(key=lambda r: -r.score)

    return ScoreRouteResponse(scored_routes=scored, model=model_info)


def recommend_route(req: ScoreRouteRequest) -> RecommendRouteResponse:
    """Score candidates and return the best + up to 2 alternatives."""
    result = score_routes(req)

    if not result.scored_routes:
        raise ValueError("No candidates available for recommendation")

    return RecommendRouteResponse(
        recommended_route=result.scored_routes[0],
        alternatives=result.scored_routes[1:3],
        model=result.model,
    )
