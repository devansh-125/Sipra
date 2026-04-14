"""
Route Scoring Model Training
==============================
Trains a GBRegressor on supply_chain_routes.csv to predict route_score (0-1).

Usage:
  cd ai-service && python training/route/train_model.py
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR.parent / "data" / "route" / "supply_chain_routes.csv"
MODEL_DIR = BASE_DIR.parent.parent / "app" / "models"

FEATURE_COLS = [
    "distance_km",
    "estimated_time_min",
    "weather_risk",
    "traffic_risk",
    "disruption_risk",
    "cost",
]

OVERFIT_THRESHOLD = 0.05


def main() -> None:
    # ---- Load data ----
    print(f"[train] Loading {DATA_FILE} ...")
    df = pd.read_csv(DATA_FILE)
    print(f"[train] {len(df):,} rows loaded")

    X = df[FEATURE_COLS].values
    y = df["route_score"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42,
    )

    print(f"[train] Split: {len(X_train):,} train / {len(X_test):,} test")
    print(f"[train] Mean score (train): {y_train.mean():.3f}")
    print(f"[train] Mean score (test):  {y_test.mean():.3f}")

    # ==================================================================
    #  GBRegressor (route_score)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL: GBRegressor (route_score)")
    print("=" * 60)

    reg = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        min_samples_leaf=15,
        subsample=0.8,
        random_state=42,
    )

    cv_r2 = cross_val_score(reg, X_train, y_train, cv=5, scoring="r2")
    print(f"\n  5-Fold CV R²: {cv_r2.mean():.4f} ± {cv_r2.std():.4f}")

    reg.fit(X_train, y_train)

    train_r2 = r2_score(y_train, reg.predict(X_train))
    test_r2 = r2_score(y_test, reg.predict(X_test))
    gap = abs(train_r2 - test_r2)
    status = "[OK]" if gap < OVERFIT_THRESHOLD else "[WARNING: overfit]"
    print(f"  Overfit check: train={train_r2:.3f}  test={test_r2:.3f}  gap={gap:.3f}  {status}")

    test_mae = mean_absolute_error(y_test, reg.predict(X_test))
    print(f"  Test MAE:  {test_mae:.4f} (on 0-1 scale)")
    print(f"  Test R²:   {test_r2:.4f}")

    print(f"\n  Feature importance:")
    for name, imp in sorted(zip(FEATURE_COLS, reg.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<25} {imp:.4f} {bar}")

    # ==================================================================
    #  Save model + test split
    # ==================================================================
    print("\n" + "=" * 60)
    print("  SAVED MODELS")
    print("=" * 60)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "route_score_regressor.joblib"
    joblib.dump(reg, model_path)
    kb = model_path.stat().st_size / 1024
    print(f"  {'route_score_regressor.joblib':<45} {kb:>7.0f} KB")

    test_path = BASE_DIR.parent / "data" / "route" / "test_split.npz"
    np.savez(test_path, X_test=X_test, y_test=y_test)
    kb = test_path.stat().st_size / 1024
    print(f"  {'test_split.npz':<45} {kb:>7.0f} KB")

    print("\n[train] Done!")


if __name__ == "__main__":
    main()
