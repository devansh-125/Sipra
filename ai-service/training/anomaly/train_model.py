"""
Anomaly Detection Model Training
==================================
Trains 2 models on supply_chain_anomalies.csv:
  1. GBRegressor   → anomaly_score  (continuous 0-1)
  2. RandomForest   → is_anomaly    (binary 0/1)

Usage:
  cd ai-service && python training/anomaly/train_model.py
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import (
    accuracy_score,
    mean_absolute_error,
    r2_score,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR.parent / "data" / "anomaly" / "supply_chain_anomalies.csv"
MODEL_DIR = BASE_DIR.parent.parent / "app" / "models"

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

OVERFIT_THRESHOLD = 0.05   # max allowed train-test gap


def main() -> None:
    # ---- Load data ----
    print(f"[train] Loading {DATA_FILE} ...")
    df = pd.read_csv(DATA_FILE)
    print(f"[train] {len(df):,} rows loaded")

    X = df[FEATURE_COLS].values
    y_score = df["anomaly_score"].values
    y_class = df["is_anomaly"].values

    X_train, X_test, ys_train, ys_test, yc_train, yc_test = train_test_split(
        X, y_score, y_class, test_size=0.20, random_state=42, stratify=y_class,
    )

    print(f"[train] Split: {len(X_train):,} train / {len(X_test):,} test")
    print(f"[train] Train anomaly rate: {yc_train.mean():.1%}")
    print(f"[train] Test  anomaly rate: {yc_test.mean():.1%}")

    # ==================================================================
    #  MODEL 1: GBRegressor (anomaly_score)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL 1: GBRegressor (anomaly_score)")
    print("=" * 60)

    reg = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        min_samples_leaf=15,
        subsample=0.8,
        random_state=42,
    )

    cv_r2 = cross_val_score(reg, X_train, ys_train, cv=5, scoring="r2")
    print(f"\n  5-Fold CV R²: {cv_r2.mean():.4f} ± {cv_r2.std():.4f}")

    reg.fit(X_train, ys_train)

    train_r2 = r2_score(ys_train, reg.predict(X_train))
    test_r2 = r2_score(ys_test, reg.predict(X_test))
    gap = abs(train_r2 - test_r2)
    status = "[OK]" if gap < OVERFIT_THRESHOLD else "[WARNING: overfit]"
    print(f"  Overfit check: train={train_r2:.3f}  test={test_r2:.3f}  gap={gap:.3f}  {status}")

    test_mae = mean_absolute_error(ys_test, reg.predict(X_test))
    print(f"  Test MAE:  {test_mae:.4f} (on 0-1 scale)")
    print(f"  Test R²:   {test_r2:.4f}")

    print(f"\n  Feature importance:")
    for name, imp in sorted(zip(FEATURE_COLS, reg.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<30} {imp:.4f} {bar}")

    # ==================================================================
    #  MODEL 2: RandomForestClassifier (is_anomaly)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL 2: RandomForestClassifier (is_anomaly)")
    print("=" * 60)

    clf = RandomForestClassifier(
        n_estimators=150,
        max_depth=6,
        min_samples_leaf=20,
        min_samples_split=40,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
    )

    cv_acc = cross_val_score(clf, X_train, yc_train, cv=5, scoring="accuracy")
    print(f"\n  5-Fold CV accuracy: {cv_acc.mean():.3f} ± {cv_acc.std():.3f}")
    print(f"  Per-fold: {[f'{s:.3f}' for s in cv_acc]}")

    clf.fit(X_train, yc_train)

    train_acc = accuracy_score(yc_train, clf.predict(X_train))
    test_acc = accuracy_score(yc_test, clf.predict(X_test))
    gap = abs(train_acc - test_acc)
    status = "[OK]" if gap < OVERFIT_THRESHOLD else "[WARNING: overfit]"
    print(f"  Overfit check: train={train_acc:.3f}  test={test_acc:.3f}  gap={gap:.3f}  {status}")

    print(f"\n  Feature importance:")
    for name, imp in sorted(zip(FEATURE_COLS, clf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<30} {imp:.4f} {bar}")

    # ==================================================================
    #  Save models + test split
    # ==================================================================
    print("\n" + "=" * 60)
    print("  SAVED MODELS")
    print("=" * 60)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    models = {
        "anomaly_score_regressor.joblib": reg,
        "anomaly_classifier.joblib": clf,
    }

    for filename, model in models.items():
        p = MODEL_DIR / filename
        joblib.dump(model, p)
        kb = p.stat().st_size / 1024
        print(f"  {filename:<45} {kb:>7.0f} KB")

    # Save test split for evaluator
    test_path = BASE_DIR.parent / "data" / "anomaly" / "test_split.npz"
    np.savez(test_path, X_test=X_test, ys_test=ys_test, yc_test=yc_test)
    kb = test_path.stat().st_size / 1024
    print(f"  {'test_split.npz':<45} {kb:>7.0f} KB")

    print("\n[train] Done!")


if __name__ == "__main__":
    main()
