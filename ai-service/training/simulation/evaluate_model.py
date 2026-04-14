"""
Evaluate simulation models on held-out data.
Re-generates data with a different seed and reports R², MAE, and sample predictions.
"""

from __future__ import annotations
import pathlib, joblib, numpy as np
from generate_data import generate

MODEL_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "app" / "models"
FEATURES = ["type_encoded", "severity", "affected_radius_km", "hour"]

MODELS = {
    "impacted_shipments": "simulation_shipments_regressor.joblib",
    "delay_min":          "simulation_delay_regressor.joblib",
}


def evaluate() -> None:
    df = generate(n=5000, seed=99)
    X = df[FEATURES].values

    for target_col, fname in MODELS.items():
        path = MODEL_DIR / fname
        model = joblib.load(path)
        y_true = df[target_col].values
        y_pred = model.predict(X)

        r2 = model.score(X, y_true)
        mae = np.mean(np.abs(y_true - y_pred))

        print(f"\n{'='*50}")
        print(f"Model: {fname}")
        print(f"  Hold-out R²:  {r2:.4f}")
        print(f"  Hold-out MAE: {mae:.2f}")

        # Sample predictions
        idx = np.random.default_rng(0).choice(len(X), 5, replace=False)
        print(f"  Sample predictions:")
        for i in idx:
            print(f"    type={df.iloc[i]['type']:15s} sev={df.iloc[i]['severity']:.1f} "
                  f"radius={df.iloc[i]['affected_radius_km']:.1f}km hour={int(df.iloc[i]['hour']):02d} "
                  f"→ true={y_true[i]:.0f}  pred={y_pred[i]:.1f}")


if __name__ == "__main__":
    evaluate()
