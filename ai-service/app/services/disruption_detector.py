"""
Anomaly Detection Service
==========================
Loads trained anomaly .joblib models and exposes detect_anomaly().
Uses 2 models:
  - anomaly_score_regressor: continuous anomaly score (0-1)
  - anomaly_classifier: binary is_anomaly (0/1)
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np

from app.schemas.models import (
    DetectAnomalyRequest,
    DetectAnomalyResponse,
    AnomalyIndicator,
    AnomalyModelInfo,
)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_VERSION = "v1"
MODEL_NAME = "ml-anomaly-model"

_regressor = None
_classifier = None

# Order must match training FEATURE_COLS
METRIC_NAMES = [
    "delivery_time_deviation",
    "order_volume_spike",
    "inventory_level",
    "supplier_lead_time",
    "defect_rate",
    "transport_cost_ratio",
    "weather_severity",
    "port_congestion",
]


def load_anomaly_models() -> None:
    """Load anomaly models from disk. Called once at FastAPI startup."""
    global _regressor, _classifier

    reg_path = MODEL_DIR / "anomaly_score_regressor.joblib"
    clf_path = MODEL_DIR / "anomaly_classifier.joblib"

    for p in [reg_path, clf_path]:
        if not p.exists():
            raise FileNotFoundError(f"Anomaly model not found: {p}")

    _regressor = joblib.load(reg_path)
    _classifier = joblib.load(clf_path)

    print(f"[anomaly] Loaded 2 anomaly model files from {MODEL_DIR}")


def detect_anomaly(req: DetectAnomalyRequest) -> DetectAnomalyResponse:
    """Run anomaly detection using trained ML models."""
    if _regressor is None:
        raise RuntimeError("Anomaly models not loaded. Call load_anomaly_models() first.")

    # Build feature vector from metrics dict
    # Missing metrics default to 0.0 (same as backend normalising unknowns)
    feature_values = []
    for name in METRIC_NAMES:
        val = req.metrics.get(name, 0.0)
        feature_values.append(max(0.0, min(1.0, float(val))))

    features = np.array([feature_values])

    # Model 1: Anomaly score regressor (R²=0.998)
    anomaly_score = float(np.clip(_regressor.predict(features)[0], 0.0, 1.0))

    # Model 2: Classifier for binary is_anomaly
    is_anomaly = bool(_classifier.predict(features)[0])

    # Also respect threshold (matches backend logic)
    threshold = req.threshold
    if anomaly_score >= threshold:
        is_anomaly = True

    # Top indicators: sort metrics by value descending, take top 5
    metric_scores = [(name, feature_values[i]) for i, name in enumerate(METRIC_NAMES)]
    metric_scores.sort(key=lambda x: -x[1])
    top_indicators = [
        AnomalyIndicator(metric=name, score=round(score, 4))
        for name, score in metric_scores[:5]
    ]

    return DetectAnomalyResponse(
        anomaly_score=round(anomaly_score, 4),
        threshold=threshold,
        is_anomaly=is_anomaly,
        top_indicators=top_indicators,
        model=AnomalyModelInfo(
            name=MODEL_NAME,
            version=MODEL_VERSION,
            source="python-ml",
        ),
    )
