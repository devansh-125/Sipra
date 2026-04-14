"""
Route Scoring Model Evaluation
================================
Loads trained route model + test split, prints detailed metrics.

Usage:
  cd ai-service && python training/route/evaluate_model.py
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR.parent.parent / "app" / "models"
DATA_DIR = BASE_DIR.parent / "data" / "route"

FEATURE_COLS = [
    "distance_km",
    "estimated_time_min",
    "weather_risk",
    "traffic_risk",
    "disruption_risk",
    "cost",
]


def main() -> None:
    reg = joblib.load(MODEL_DIR / "route_score_regressor.joblib")

    data = np.load(DATA_DIR / "test_split.npz")
    X_test = data["X_test"]
    y_test = data["y_test"]
    print(f"[eval] Test set: {len(X_test):,} samples")

    print("\n" + "=" * 60)
    print("  REGRESSOR: route_score (GradientBoosting)")
    print("=" * 60)

    y_pred = reg.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)

    print(f"\n  MAE:   {mae:.4f}  (on 0-1 scale)")
    print(f"  RMSE:  {rmse:.4f}")
    print(f"  R²:    {r2:.4f}")

    print(f"\n  Score range (actual):    {y_test.min():.3f} – {y_test.max():.3f}")
    print(f"  Score range (predicted): {y_pred.min():.3f} – {y_pred.max():.3f}")
    print(f"  Actual mean:    {y_test.mean():.3f}")
    print(f"  Predicted mean: {y_pred.mean():.3f}")

    errors = np.abs(y_test - y_pred)
    print(f"\n  Error Distribution:")
    for t in [0.01, 0.02, 0.05, 0.10]:
        pct = (errors <= t).mean()
        print(f"    Within ±{t:.2f}: {pct:.1%}")

    print(f"\n  Feature Importance:")
    for name, imp in sorted(zip(FEATURE_COLS, reg.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<25} {imp:.4f} {bar}")

    print("\n[eval] Done!")


if __name__ == "__main__":
    main()
