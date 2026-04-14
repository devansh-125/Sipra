"""
Supply Chain AI Service — FastAPI Application
===============================================
Serves ML-powered predictions for delay, anomaly, and route scoring.

The backend (Node.js) calls these endpoints via callRemoteAi().
All responses are wrapped in { "data": ... } to match backend expectations.

Startup: loads trained .joblib models into memory for fast inference.
"""

from __future__ import annotations

import os
import hmac
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.schemas.models import PredictDelayRequest, DetectAnomalyRequest, ScoreRouteRequest, SimulateDisruptionRequest
from app.services.prediction_service import load_models, predict_delay
from app.services.disruption_detector import load_anomaly_models, detect_anomaly
from app.services.route_optimizer import load_route_models, score_routes, recommend_route
from app.services.simulation_service import load_simulation_models, simulate_disruption


# ---------------------------------------------------------------------------
# API key authentication (matches backend's x-internal-api-key header)
# ---------------------------------------------------------------------------
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")


async def verify_api_key(request: Request) -> None:
    """Check x-internal-api-key header using timing-safe comparison."""
    if not INTERNAL_API_KEY:
        return  # no key configured = allow all (dev mode)

    key = request.headers.get("x-internal-api-key", "")
    if not key:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            key = auth[7:]

    if not hmac.compare_digest(key, INTERNAL_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load models
    print("[main] Loading ML models ...")
    load_models()
    load_anomaly_models()
    load_route_models()
    load_simulation_models()
    print("[main] Models loaded. Ready to serve predictions.")
    yield
    # Shutdown
    print("[main] Shutting down.")


app = FastAPI(
    title="Supply Chain AI Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


# ---------------------------------------------------------------------------
# Delay prediction endpoint
# ---------------------------------------------------------------------------
@app.post("/ai/predict-delay")
async def predict_delay_endpoint(request: Request):
    await verify_api_key(request)

    body = await request.json()
    req = PredictDelayRequest(**body)
    result = predict_delay(req)

    return {"data": result.model_dump()}


# ---------------------------------------------------------------------------
# Placeholder endpoints (anomaly + route — to be implemented)
# ---------------------------------------------------------------------------
@app.post("/ai/detect-anomaly")
async def detect_anomaly_endpoint(request: Request):
    await verify_api_key(request)

    body = await request.json()
    req = DetectAnomalyRequest(**body)
    result = detect_anomaly(req)

    return {"data": result.model_dump()}


@app.post("/ai/score-route")
async def score_route_endpoint(request: Request):
    await verify_api_key(request)

    body = await request.json()
    req = ScoreRouteRequest(**body)
    result = score_routes(req)

    return {"data": result.model_dump()}


@app.post("/ai/recommend-route")
async def recommend_route_endpoint(request: Request):
    await verify_api_key(request)

    body = await request.json()
    req = ScoreRouteRequest(**body)
    result = recommend_route(req)

    return {"data": result.model_dump()}


@app.post("/ai/simulate-disruption")
async def simulate_disruption_endpoint(request: Request):
    await verify_api_key(request)

    body = await request.json()
    req = SimulateDisruptionRequest(**body)
    result = simulate_disruption(req)

    return {"data": result.model_dump()}


# ---------------------------------------------------------------------------
# Run with: uvicorn app.main:app --host 0.0.0.0 --port 8000
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
