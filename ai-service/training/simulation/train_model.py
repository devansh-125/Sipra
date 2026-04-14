"""
Train two Gradient-Boosting regressors for disruption simulation:

  1. impacted_shipments_regressor  — how many shipments affected
  2. delay_regressor               — estimated average delay (minutes)

Features: type_encoded, severity, affected_radius_km, hour
Anti-overfitting: 5-fold CV, constrained tree depth, learning rate 0.05.
"""

from __future__ import annotations
import pathlib, joblib, numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

SEED = 42
DATA_DIR = pathlib.Path(__file__).resolve().parent / "data"
MODEL_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "app" / "models"

FEATURES = ["type_encoded", "severity", "affected_radius_km", "hour"]

TARGETS = {
    "impacted_shipments": "simulation_shipments_regressor.joblib",
    "delay_min":          "simulation_delay_regressor.joblib",
}

# Shared hyper-parameters (conservative to avoid overfit)
GBR_PARAMS = dict(
    n_estimators=300,
    learning_rate=0.05,
    max_depth=5,
    min_samples_leaf=20,
    subsample=0.8,
    random_state=SEED,
)


def train() -> None:
    csv_path = DATA_DIR / "simulation_data.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Training data not found: {csv_path}")

    df = pd.read_csv(csv_path)
    X = df[FEATURES].values
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    for target_col, fname in TARGETS.items():
        print(f"\n{'='*60}")
        print(f"Training: {target_col}")
        print(f"{'='*60}")
        y = df[target_col].values

        model = GradientBoostingRegressor(**GBR_PARAMS)

        # 5-fold cross-validation
        cv_r2 = cross_val_score(model, X, y, cv=5, scoring="r2")
        cv_mae = -cross_val_score(model, X, y, cv=5, scoring="neg_mean_absolute_error")

        print(f"  5-Fold CV R²:  {cv_r2.mean():.4f} ± {cv_r2.std():.4f}")
        print(f"  5-Fold CV MAE: {cv_mae.mean():.2f} ± {cv_mae.std():.2f}")

        # Full train
        model.fit(X, y)
        train_r2 = model.score(X, y)
        overfit_gap = train_r2 - cv_r2.mean()

        status = "[OK]" if overfit_gap < 0.05 else "[WARN: overfit]"
        print(f"  Train R²:      {train_r2:.4f}")
        print(f"  Overfit gap:   {overfit_gap:.4f} {status}")

        # Feature importances
        for feat, imp in zip(FEATURES, model.feature_importances_):
            print(f"    {feat:25s} {imp:.4f}")

        out_path = MODEL_DIR / fname
        joblib.dump(model, out_path)
        print(f"  Saved → {out_path}  ({out_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    train()
