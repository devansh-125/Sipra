"""
Delay Prediction Model Training (v2 — anti-overfitting)
=========================================================
Trains 3 models with cross-validation and overfitting detection:
  1. RandomForestClassifier   → is_delayed (0/1)
  2. GradientBoostingRegressor → actual_delay_min (minutes)
  3. GradientBoostingRegressor → delay_probability (0-1)

Anti-overfitting measures:
  - 5-fold cross-validation (detects if model only works on one split)
  - Train/test gap monitoring (gap > 5% = warning)
  - Controlled tree depth + min_samples_leaf (regularisation)
  - Reports CV mean ± std (low std = stable model)

Usage:
  cd ai-service && python training/train_models.py
"""

from __future__ import annotations
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "supply_chain_data.csv"
MODEL_DIR = BASE_DIR.parent / "app" / "models"

FEATURE_COLS = [
    "distance_km",
    "weather_risk_score",
    "traffic_risk_score",
    "congestion_score",
    "disruptions_count",
    "priority_encoded",
    "current_eta_minutes",
]

SEED = 42
TEST_SIZE = 0.20
CV_FOLDS = 5


def print_importance(names: list[str], importances: np.ndarray) -> None:
    for name, imp in sorted(zip(names, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {name:<25} {imp:.4f} {bar}")


def check_overfitting(name: str, train_score: float, test_score: float, threshold: float = 0.05) -> None:
    gap = train_score - test_score
    status = "OK" if gap <= threshold else "WARNING: possible overfit"
    print(f"  Overfit check: train={train_score:.3f}  test={test_score:.3f}  gap={gap:.3f}  [{status}]")


def main() -> None:
    # ------------------------------------------------------------------
    # 1. Load data
    # ------------------------------------------------------------------
    print(f"[train] Loading {DATA_FILE} ...")
    df = pd.read_csv(DATA_FILE)
    print(f"[train] {len(df):,} rows loaded")

    # ------------------------------------------------------------------
    # 2. Encode categorical: priority → integer
    # ------------------------------------------------------------------
    le_priority = LabelEncoder()
    le_priority.fit(["low", "medium", "high", "critical"])  # fixed order
    df["priority_encoded"] = le_priority.transform(df["priority"])

    # ------------------------------------------------------------------
    # 3. Prepare features and targets
    # ------------------------------------------------------------------
    X = df[FEATURE_COLS].values
    y_class = df["is_delayed"].values
    y_delay_min = df["actual_delay_min"].values
    y_delay_prob = df["delay_probability"].values

    X_train, X_test, yc_train, yc_test, ym_train, ym_test, yp_train, yp_test = \
        train_test_split(X, y_class, y_delay_min, y_delay_prob,
                         test_size=TEST_SIZE, random_state=SEED, stratify=y_class)

    print(f"[train] Split: {len(X_train):,} train / {len(X_test):,} test")
    print(f"[train] Train delay rate: {yc_train.mean():.1%}")
    print(f"[train] Test  delay rate: {yc_test.mean():.1%}")

    # ==================================================================
    # MODEL 1: Classifier — is_delayed (0/1)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL 1: RandomForestClassifier (is_delayed)")
    print("=" * 60)

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,             # was 15 → constrain to reduce overfit
        min_samples_leaf=20,     # was 8  → force generalisation
        min_samples_split=40,    # was 15 → prevent tiny splits
        max_features="sqrt",     # only consider √n features per split
        class_weight="balanced",
        random_state=SEED,
        n_jobs=-1,
    )

    # Cross-validation FIRST (on training set)
    cv_scores = cross_val_score(clf, X_train, yc_train, cv=CV_FOLDS, scoring="accuracy", n_jobs=-1)
    print(f"\n  5-Fold CV accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
    print(f"  Per-fold: {[f'{s:.3f}' for s in cv_scores]}")

    # Then fit on full training set
    clf.fit(X_train, yc_train)
    train_acc = clf.score(X_train, yc_train)
    test_acc = clf.score(X_test, yc_test)
    check_overfitting("Classifier", train_acc, test_acc)

    print(f"\n  Feature importance:")
    print_importance(FEATURE_COLS, clf.feature_importances_)

    # ==================================================================
    # MODEL 2: Regressor — actual_delay_min (delayed samples only)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL 2: GBRegressor (actual_delay_min)")
    print("=" * 60)

    delayed_train = yc_train == 1
    delayed_test = yc_test == 1

    reg_delay = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        min_samples_leaf=15,
        subsample=0.8,          # stochastic GB → reduces overfitting
        random_state=SEED,
    )

    X_del_train = X_train[delayed_train]
    y_del_train = ym_train[delayed_train]
    X_del_test = X_test[delayed_test]
    y_del_test = ym_test[delayed_test]

    print(f"\n  Training on {delayed_train.sum():,} delayed samples ...")

    # Cross-validation
    cv_mae = cross_val_score(reg_delay, X_del_train, y_del_train, cv=CV_FOLDS,
                             scoring="neg_mean_absolute_error", n_jobs=-1)
    print(f"  5-Fold CV MAE:  {-cv_mae.mean():.1f} ± {cv_mae.std():.1f} min")

    reg_delay.fit(X_del_train, y_del_train)

    train_r2 = reg_delay.score(X_del_train, y_del_train)
    test_r2 = reg_delay.score(X_del_test, y_del_test)
    check_overfitting("Delay Regressor (R²)", train_r2, test_r2)

    preds = reg_delay.predict(X_del_test)
    mae = mean_absolute_error(y_del_test, preds)
    rmse = np.sqrt(mean_squared_error(y_del_test, preds))
    print(f"  Test MAE:  {mae:.1f} min")
    print(f"  Test RMSE: {rmse:.1f} min")
    print(f"  Test R²:   {test_r2:.3f}")

    print(f"\n  Feature importance:")
    print_importance(FEATURE_COLS, reg_delay.feature_importances_)

    # ==================================================================
    # MODEL 3: Regressor — delay_probability (0-1, all samples)
    # ==================================================================
    print("\n" + "=" * 60)
    print("  MODEL 3: GBRegressor (delay_probability)")
    print("=" * 60)

    reg_prob = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        min_samples_leaf=15,
        subsample=0.8,
        random_state=SEED,
    )

    # Cross-validation
    cv_r2 = cross_val_score(reg_prob, X_train, yp_train, cv=CV_FOLDS,
                            scoring="r2", n_jobs=-1)
    print(f"\n  5-Fold CV R²: {cv_r2.mean():.4f} ± {cv_r2.std():.4f}")

    reg_prob.fit(X_train, yp_train)

    train_r2_p = reg_prob.score(X_train, yp_train)
    test_r2_p = reg_prob.score(X_test, yp_test)
    check_overfitting("Probability Regressor (R²)", train_r2_p, test_r2_p)

    prob_preds = reg_prob.predict(X_test)
    prob_mae = mean_absolute_error(yp_test, prob_preds)
    print(f"  Test MAE:  {prob_mae:.4f} (on 0-1 scale)")
    print(f"  Test R²:   {test_r2_p:.4f}")

    print(f"\n  Feature importance:")
    print_importance(FEATURE_COLS, reg_prob.feature_importances_)

    # ==================================================================
    # Save all models
    # ==================================================================
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    paths = {
        "delay_classifier.joblib": clf,
        "delay_regressor.joblib": reg_delay,
        "delay_probability_regressor.joblib": reg_prob,
        "label_encoders.joblib": {"priority": le_priority},
    }

    print("\n" + "=" * 60)
    print("  SAVED MODELS")
    print("=" * 60)
    for filename, model in paths.items():
        p = MODEL_DIR / filename
        joblib.dump(model, p)
        print(f"  {p.name:<40} {p.stat().st_size / 1024:>8.0f} KB")

    # Save test split for evaluate_models.py
    test_path = BASE_DIR / "data" / "test_split.npz"
    np.savez(test_path, X_test=X_test, yc_test=yc_test,
             ym_test=ym_test, yp_test=yp_test)
    print(f"  {'test_split.npz':<40} {test_path.stat().st_size / 1024:>8.0f} KB")

    print("\n[train] Done!")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
