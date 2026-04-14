"""
Disruption Simulation Service
==============================
Uses two trained GBRegressors to estimate the impact of a disruption:

  1. simulation_shipments_regressor  → impacted_shipments_estimate
  2. simulation_delay_regressor      → estimated_average_delay_min

Features used: type_encoded, severity, affected_radius_km, hour

The backend's heuristic fallback uses simple formulas:
  impacted = severity*2 + radius/5
  delay    = severity*8 + radius*0.6

Our ML models capture type-specific multipliers, rush-hour effects,
and non-linear severity interactions that the heuristic misses.
"""

from __future__ import annotations

import pathlib
from datetime import datetime, timezone

import joblib
import numpy as np

from app.schemas.models import (
    SimulateDisruptionRequest,
    SimulateDisruptionResponse,
    DisruptionScenario,
    SimulationModelInfo,
)

MODEL_DIR = pathlib.Path(__file__).resolve().parent.parent / "models"

TYPE_MAP = {"weather": 0, "congestion": 1, "blockage": 2, "vehicle_issue": 3}

_shipments_model = None
_delay_model = None


def load_simulation_models() -> None:
    global _shipments_model, _delay_model

    ship_path = MODEL_DIR / "simulation_shipments_regressor.joblib"
    delay_path = MODEL_DIR / "simulation_delay_regressor.joblib"

    if not ship_path.exists():
        raise FileNotFoundError(f"Model not found: {ship_path}")
    if not delay_path.exists():
        raise FileNotFoundError(f"Model not found: {delay_path}")

    _shipments_model = joblib.load(ship_path)
    _delay_model = joblib.load(delay_path)

    print(f"[simulation] Loaded 2 simulation model files")


def simulate_disruption(req: SimulateDisruptionRequest) -> SimulateDisruptionResponse:
    if _shipments_model is None or _delay_model is None:
        raise RuntimeError("Simulation models not loaded")

    # Encode disruption type (default to weather=0 if unknown)
    type_encoded = TYPE_MAP.get(req.type, 0)

    # Clamp severity to 1-10
    severity = max(1.0, min(10.0, req.severity))

    # Clamp radius
    radius = max(0.0, req.affected_radius_km)

    # Use provided hour or current UTC hour
    hour = req.hour if req.hour is not None else datetime.now(timezone.utc).hour

    # Build feature vector: [type_encoded, severity, affected_radius_km, hour]
    X = np.array([[type_encoded, severity, radius, float(hour)]])

    # Predict
    impacted_raw = _shipments_model.predict(X)[0]
    delay_raw = _delay_model.predict(X)[0]

    impacted_shipments = max(1, int(round(impacted_raw)))
    estimated_delay_min = max(1, int(round(delay_raw)))

    scenario = DisruptionScenario(
        type=req.type,
        severity=int(round(severity)),
        node_id=req.node_id,
        edge_id=req.edge_id,
        latitude=req.latitude,
        longitude=req.longitude,
        affected_radius_km=radius,
        impacted_shipments_estimate=impacted_shipments,
        estimated_average_delay_min=estimated_delay_min,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    return SimulateDisruptionResponse(
        scenario=scenario,
        persisted_disruption=None,
        model=SimulationModelInfo(
            name="ml-disruption-simulator",
            version="v1",
            source="python-ml",
        ),
    )
