"""
Anomaly Model Evaluation
=========================
Loads trained anomaly models + test split, prints detailed metrics.

Usage:
  cd ai-service && python training/anomaly/evaluate_model.py
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    r2_score,
)

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR.parent.parent / "app" / "models"
DATA_DIR = BASE_DIR.parent / "data" / "anomaly"

FEATURE_COLS = [
    "delivery_time_deviation",
    "order_volume_spike",
    "inventory_level",
    "supplier_lead_time",
    "defect_rate",
    "transport_cost_ratio",
    "weather_severity",
    "port_congestion",
]


def main() -> None:
    # Load models
    reg = joblib.load(MODEL_DIR / "anomaly_score_regressor.joblib")
    clf = joblib.load(MODEL_DIR / "anomaly_classifier.joblib")

    # Load test data
    data = np.load(DATA_DIR / "test_split.npz")
    X_test = data["X_test"]
    ys_test = data["ys_test"]
    yc_test = data["yc_test"]
    print(f"[eval] Test set: {len(X_test):,} samples")

    # ---- Regressor evaluation ----
    print("\n" + "=" * 60)
    print("  REGRESSOR: anomaly_score (GradientBoosting)")
    print("=" * 60)

    ys_pred = reg.predict(X_test)
    mae = mean_absolute_error(ys_test, ys_pred)
    rmse = np.sqrt(mean_squared_error(ys_test, ys_pred))
    r2 = r2_score(ys_test, ys_pred)

    print(f"\n  MAE:   {mae:.4f}  (on 0-1 scale)")
    print(f"  RMSE:  {rmse:.4f}")
    print(f"  R²:    {r2:.4f}")

    print(f"\n  Score range (actual):    {ys_test.min():.3f} – {ys_test.max():.3f}")
    print(f"  Score range (predicted): {ys_pred.min():.3f} – {ys_pred.max():.3f}")

    errors = np.abs(ys_test - ys_pred)
    print(f"\n  Error Distribution:")
    for t in [0.01, 0.02, 0.05, 0.10]:
        pct = (errors <= t).mean()
        print(f"    Within ±{t:.2f}: {pct:.1%}")

    print(f"\n  Feature Importance:")
    for name, imp in sorted(zip(FEATURE_COLS, reg.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<30} {imp:.4f} {bar}")

    # ---- Classifier evaluation ----
    print("\n" + "=" * 60)
    print("  CLASSIFIER: is_anomaly (RandomForest)")
    print("=" * 60)

    yc_pred = clf.predict(X_test)

    print(f"\n  Accuracy:  {accuracy_score(yc_test, yc_pred):.3f}")
    print(f"  Precision: {precision_score(yc_test, yc_pred):.3f}")
    print(f"  Recall:    {recall_score(yc_test, yc_pred):.3f}")
    print(f"  F1 Score:  {f1_score(yc_test, yc_pred):.3f}")

    cm = confusion_matrix(yc_test, yc_pred)
    print(f"\n  Confusion Matrix:")
    print(f"    TN={cm[0][0]:>5}  FP={cm[0][1]:>5}")
    print(f"    FN={cm[1][0]:>5}  TP={cm[1][1]:>5}")

    print(f"\n  Classification Report:")
    print(classification_report(yc_test, yc_pred, target_names=["normal", "anomaly"]))

    print(f"  Feature Importance:")
    for name, imp in sorted(zip(FEATURE_COLS, clf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<30} {imp:.4f} {bar}")

    print("\n[eval] Done!")


if __name__ == "__main__":
    main()
