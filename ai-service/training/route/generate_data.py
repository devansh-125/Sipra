"""
Route Scoring Dataset Generator
================================

Generates synthetic route-candidate data for training a route scoring model.
Matches the backend's scoreRouteCandidates() heuristic schema.

Backend contract (aiService.ts):
  Input per candidate:
    distance_km, estimated_time_min, weather_risk, traffic_risk,
    disruption_risk, cost

  Weights (defaults): time=0.3, distance=0.2, weather=0.15,
                      traffic=0.15, disruption=0.15, cost=0.05

  Heuristic formula:
    penalties = each dim / max_in_batch (time, distance, cost)
                 or clamped 0-1 (weather, traffic, disruption)
    weighted_penalty = sum(penalty_i × normalised_weight_i)
    score = clamp(1 - weighted_penalty, 0, 1)

  Because the heuristic depends on the MAX values across a BATCH of candidates,
  we generate individual route rows with an absolute scoring approach:
    - Normalise time/distance/cost by realistic upper bounds instead of batch max
    - This lets the ML model score any single route without needing batch context

Output CSV columns:
  distance_km           float  50–3000
  estimated_time_min    float  30–4000
  weather_risk          float  0–1
  traffic_risk          float  0–1
  disruption_risk       float  0–1
  cost                  float  50–10000
  route_score           float  0–1   (target — higher is better)

Usage:
  cd ai-service
  python training/route/generate_data.py
  python training/route/generate_data.py --rows 25000
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEED = 42
DEFAULT_ROWS = 25_000
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "route"
OUTPUT_FILE = OUTPUT_DIR / "supply_chain_routes.csv"

# Default weights from backend
DEFAULT_WEIGHTS = {
    "time": 0.30,
    "distance": 0.20,
    "weather": 0.15,
    "traffic": 0.15,
    "disruption": 0.15,
    "cost": 0.05,
}

# Realistic upper bounds for normalisation (instead of batch-max)
MAX_DISTANCE = 3000.0
MAX_TIME = 4000.0
MAX_COST = 10000.0

# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def generate_route_data(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Generate route candidate features and compute scores."""

    # Features
    distance_km = rng.lognormal(mean=5.5, sigma=0.7, size=n)
    distance_km = np.clip(distance_km, 50, MAX_DISTANCE)

    # Time correlated with distance + variability
    speed = rng.uniform(0.8, 2.0, size=n)  # min per km
    estimated_time_min = distance_km * speed
    estimated_time_min = np.clip(estimated_time_min, 30, MAX_TIME)

    weather_risk = rng.beta(a=2.0, b=5.0, size=n)
    traffic_risk = rng.beta(a=2.5, b=4.0, size=n)
    disruption_risk = rng.beta(a=1.5, b=6.0, size=n)  # rarer than weather/traffic

    # Cost correlated with distance + some randomness
    base_cost = distance_km * rng.uniform(1.5, 4.0, size=n)
    cost = np.clip(base_cost, 50, MAX_COST)

    # --- Compute score (backend formula adapted for absolute normalisation) ---
    w = DEFAULT_WEIGHTS
    w_total = sum(w.values())
    nw = {k: v / w_total for k, v in w.items()}

    time_penalty = estimated_time_min / MAX_TIME
    distance_penalty = distance_km / MAX_DISTANCE
    weather_penalty = np.clip(weather_risk, 0, 1)
    traffic_penalty = np.clip(traffic_risk, 0, 1)
    disruption_penalty = np.clip(disruption_risk, 0, 1)
    cost_penalty = cost / MAX_COST

    weighted_penalty = (
        time_penalty * nw["time"]
        + distance_penalty * nw["distance"]
        + weather_penalty * nw["weather"]
        + traffic_penalty * nw["traffic"]
        + disruption_penalty * nw["disruption"]
        + cost_penalty * nw["cost"]
    )

    # Deterministic score — NO noise on target (same philosophy as delay model v2)
    route_score = np.clip(1.0 - weighted_penalty, 0.0, 1.0)

    return pd.DataFrame({
        "distance_km": np.round(distance_km, 1),
        "estimated_time_min": np.round(estimated_time_min, 1),
        "weather_risk": np.round(weather_risk, 4),
        "traffic_risk": np.round(traffic_risk, 4),
        "disruption_risk": np.round(disruption_risk, 4),
        "cost": np.round(cost, 2),
        "route_score": np.round(route_score, 4),
    })


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(df: pd.DataFrame) -> None:
    expected = {"distance_km", "estimated_time_min", "weather_risk",
                "traffic_risk", "disruption_risk", "cost", "route_score"}
    assert set(df.columns) == expected, f"Column mismatch: {set(df.columns)}"

    assert df["distance_km"].between(50, MAX_DISTANCE).all()
    assert df["estimated_time_min"].between(30, MAX_TIME).all()
    assert df["weather_risk"].between(0, 1).all()
    assert df["traffic_risk"].between(0, 1).all()
    assert df["disruption_risk"].between(0, 1).all()
    assert df["cost"].between(50, MAX_COST).all()
    assert df["route_score"].between(0, 1).all()

    mean_score = df["route_score"].mean()
    assert 0.3 < mean_score < 0.9, f"Unrealistic mean score: {mean_score:.3f}"

    print(f"[validate] All checks passed for {len(df):,} rows.")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(df: pd.DataFrame) -> None:
    n = len(df)
    print("\n" + "=" * 60)
    print(f"  ROUTE DATASET SUMMARY -- {n:,} rows")
    print("=" * 60)

    print(f"\n  Route score:  min={df['route_score'].min():.3f}  "
          f"mean={df['route_score'].mean():.3f}  max={df['route_score'].max():.3f}")

    print(f"\n  Feature ranges:")
    for col in ["distance_km", "estimated_time_min", "weather_risk",
                "traffic_risk", "disruption_risk", "cost"]:
        print(f"    {col:<25} min={df[col].min():>9.1f}  mean={df[col].mean():>9.1f}  max={df[col].max():>9.1f}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate route scoring training data")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    out_path = Path(args.output) if args.output else OUTPUT_FILE

    print(f"[generate] Generating {args.rows:,} route rows (seed={args.seed}) ...")

    df = generate_route_data(args.rows, rng)
    validate(df)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[generate] Saved to {out_path} ({mb:.1f} MB)")

    print_summary(df)


if __name__ == "__main__":
    main()
