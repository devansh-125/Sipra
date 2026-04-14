"""
Delay Model Evaluation
========================
Loads trained models + test split, computes detailed metrics.

Usage:
  cd ai-service && python training/evaluate_models.py
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
MODEL_DIR = BASE_DIR.parent / "app" / "models"

FEATURE_COLS = [
    "distance_km", "weather_risk_score", "traffic_risk_score",
    "congestion_score", "disruptions_count", "priority_encoded",
    "current_eta_minutes",
]


def main() -> None:
    # Load models
    clf = joblib.load(MODEL_DIR / "delay_classifier.joblib")
    reg = joblib.load(MODEL_DIR / "delay_regressor.joblib")

    # Load test data
    data = np.load(BASE_DIR / "data" / "test_split.npz")
    X_test = data["X_test"]
    yc_test = data["yc_test"]
    yr_test = data["yr_test"]
    print(f"[eval] Test set: {len(X_test):,} samples")

    # ---- Classifier evaluation ----
    print("\n" + "=" * 60)
    print("  CLASSIFIER: is_delayed (RandomForest)")
    print("=" * 60)

    yc_pred = clf.predict(X_test)
    yc_proba = clf.predict_proba(X_test)[:, 1]

    print(f"\n  Accuracy:  {accuracy_score(yc_test, yc_pred):.3f}")
    print(f"  Precision: {precision_score(yc_test, yc_pred):.3f}")
    print(f"  Recall:    {recall_score(yc_test, yc_pred):.3f}")
    print(f"  F1 Score:  {f1_score(yc_test, yc_pred):.3f}")

    print(f"\n  Confusion Matrix:")
    cm = confusion_matrix(yc_test, yc_pred)
    print(f"    TN={cm[0][0]:>5}  FP={cm[0][1]:>5}")
    print(f"    FN={cm[1][0]:>5}  TP={cm[1][1]:>5}")

    print(f"\n  Classification Report:")
    print(classification_report(yc_test, yc_pred, target_names=["on_time", "delayed"]))

    # Feature importance
    print("  Feature Importance:")
    for name, imp in sorted(zip(FEATURE_COLS, clf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"    {name:<25} {imp:.4f} {bar}")

    # ---- Regressor evaluation (delayed samples only) ----
    print("\n" + "=" * 60)
    print("  REGRESSOR: actual_delay_min (GradientBoosting)")
    print("=" * 60)

    delayed_mask = yc_test == 1
    X_delayed = X_test[delayed_mask]
    yr_actual = yr_test[delayed_mask]

    if len(X_delayed) == 0:
        print("  No delayed samples in test set!")
        return

    yr_pred = reg.predict(X_delayed)

    mae = mean_absolute_error(yr_actual, yr_pred)
    rmse = np.sqrt(mean_squared_error(yr_actual, yr_pred))
    r2 = r2_score(yr_actual, yr_pred)

    print(f"\n  Delayed test samples: {len(X_delayed):,}")
    print(f"  MAE:   {mae:.1f} min  (average prediction error)")
    print(f"  RMSE:  {rmse:.1f} min  (penalises large errors)")
    print(f"  R²:    {r2:.3f}       (1.0 = perfect, 0 = baseline)")

    print(f"\n  Actual delay range:    {yr_actual.min():.0f} – {yr_actual.max():.0f} min")
    print(f"  Predicted delay range: {yr_pred.min():.0f} – {yr_pred.max():.0f} min")
    print(f"  Actual mean:    {yr_actual.mean():.1f} min")
    print(f"  Predicted mean: {yr_pred.mean():.1f} min")

    # Error distribution
    errors = np.abs(yr_actual - yr_pred)
    print(f"\n  Error Distribution:")
    for threshold in [5, 10, 20, 30, 60]:
        pct = (errors <= threshold).mean()
        print(f"    Within ±{threshold:>2} min: {pct:.1%}")

    print(f"\n  Feature Importance:")
    for name, imp in sorted(zip(FEATURE_COLS, reg.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 50)
        print(f"    {name:<25} {imp:.4f} {bar}")

    print("\n[eval] Done!")


if __name__ == "__main__":
    main()
