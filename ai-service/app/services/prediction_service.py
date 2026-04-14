"""
Delay Prediction Service
=========================
Loads trained .joblib models and exposes predict_delay().
Uses 3 models:
  - delay_classifier: is_delayed (0/1) for classification
  - delay_regressor: actual_delay_min (for delayed shipments)
  - delay_probability_regressor: delay_probability (0-1, precise)
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np

from app.schemas.models import PredictDelayRequest, PredictDelayResponse, DelayModelInfo

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_VERSION = "v2"
MODEL_NAME = "ml-delay-model"

# Loaded once at startup
_classifier = None
_regressor = None
_prob_regressor = None
_label_encoders = None

FEATURE_ORDER = [
    "distance_km",
    "weather_risk_score",
    "traffic_risk_score",
    "congestion_score",
    "disruptions_count",
    "priority_encoded",
    "current_eta_minutes",
]


def load_models() -> None:
    """Load models from disk. Called once at FastAPI startup."""
    global _classifier, _regressor, _prob_regressor, _label_encoders

    clf_path = MODEL_DIR / "delay_classifier.joblib"
    reg_path = MODEL_DIR / "delay_regressor.joblib"
    prob_path = MODEL_DIR / "delay_probability_regressor.joblib"
    le_path = MODEL_DIR / "label_encoders.joblib"

    for p in [clf_path, reg_path, prob_path, le_path]:
        if not p.exists():
            raise FileNotFoundError(f"Model not found: {p}")

    _classifier = joblib.load(clf_path)
    _regressor = joblib.load(reg_path)
    _prob_regressor = joblib.load(prob_path)
    _label_encoders = joblib.load(le_path)

    print(f"[prediction] Loaded 4 model files from {MODEL_DIR}")


def _compute_risk_level(probability: float) -> str:
    if probability >= 0.8:
        return "critical"
    if probability >= 0.6:
        return "high"
    if probability >= 0.35:
        return "medium"
    return "low"


def predict_delay(req: PredictDelayRequest) -> PredictDelayResponse:
    """Run delay prediction using trained ML models."""
    if _classifier is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")

    # Encode priority
    priority_str = req.priority if req.priority in ("low", "medium", "high", "critical") else "medium"
    priority_encoded = _label_encoders["priority"].transform([priority_str])[0]

    # Compute ETA if not provided (same default as backend)
    eta = req.current_eta_minutes if req.current_eta_minutes else req.distance_km * 1.4

    # Build feature vector (same order as training)
    features = np.array([[
        req.distance_km,
        req.weather_risk_score,
        req.traffic_risk_score,
        req.congestion_score,
        req.disruptions_count,
        priority_encoded,
        eta,
    ]])

    # Model 3: Probability regressor (most precise — R²=0.998)
    delay_probability = float(np.clip(_prob_regressor.predict(features)[0], 0.01, 0.99))

    # Model 1: Classifier for binary is_delayed decision
    is_delayed = bool(_classifier.predict(features)[0])

    # Model 2: Delay minutes regressor (trained on delayed samples)
    predicted_delay_raw = float(_regressor.predict(features)[0])
    predicted_delay_min = max(0, round(predicted_delay_raw))

    # Scale delay by probability when model says not delayed
    if not is_delayed:
        predicted_delay_min = round(predicted_delay_min * delay_probability * 0.5)

    risk_level = _compute_risk_level(delay_probability)

    # Factor breakdown: feature_importance × normalised_feature_value
    importances = _prob_regressor.feature_importances_
    factor_names = ["distance", "weather", "traffic", "congestion",
                    "disruptions", "priority_factor", "eta"]
    raw_values = features[0]

    factors = {}
    for name, imp, val in zip(factor_names, importances, raw_values):
        factors[name] = round(float(imp * val), 4)

    return PredictDelayResponse(
        delay_probability=round(delay_probability, 4),
        predicted_delay_min=predicted_delay_min,
        risk_level=risk_level,
        factors=factors,
        model=DelayModelInfo(
            name=MODEL_NAME,
            version=MODEL_VERSION,
            source="python-ml",
        ),
    )
