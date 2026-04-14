"""
Hybrid Dataset Pipeline for Logistics Delay Prediction
=======================================================

Generates 30,000 rows that EXACTLY match the backend's aiService.ts schema.

Strategy:
  1. If a Kaggle CSV is present in ./data/kaggle_raw.csv, extract real-world
     distributions (weather, traffic, congestion patterns) and use them to
     calibrate the synthetic generation.
  2. Otherwise, use hand-tuned distributions based on published logistics
     research and Kaggle dataset descriptions.
  3. Generate features -> compute correlated targets -> add realistic noise.

Usage:
  cd ai-service
  python training/generate_data.py
  python training/generate_data.py --rows 50000
  python training/generate_data.py --kaggle data/kaggle_raw.csv
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEED = 42
DEFAULT_ROWS = 30_000
OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_FILE = OUTPUT_DIR / "supply_chain_data.csv"

PRIORITIES = ["low", "medium", "high", "critical"]
PRIORITY_WEIGHTS = [0.20, 0.45, 0.25, 0.10]
PRIORITY_FACTOR = {"low": 0.0, "medium": 0.02, "high": 0.04, "critical": 0.06}

RISK_LEVELS = ["low", "medium", "high", "critical"]

# ---------------------------------------------------------------------------
# Kaggle integration (optional)
# ---------------------------------------------------------------------------

KAGGLE_COLUMN_MAP = {
    "Weather Condition Severity": "weather_risk_score",
    "Traffic Congestion Level": "traffic_risk_score",
    "Port Congestion Level": "congestion_score",
    "Delay Probability": "_kaggle_delay_prob",
    "Delivery Time Deviation": "_kaggle_delay_hours",
    "Risk Classification": "_kaggle_risk",
}


def try_load_kaggle(path: str | None) -> dict | None:
    """
    Attempt to load a Kaggle CSV and extract distribution parameters.
    Returns a dict of {column: {mean, std, min, max}} for calibration, or None.
    """
    if path is None or not os.path.isfile(path):
        return None

    print(f"[hybrid] Loading Kaggle dataset from {path} ...")
    try:
        raw = pd.read_csv(path)
    except Exception as exc:
        print(f"[hybrid] Failed to read Kaggle CSV: {exc}")
        return None

    distributions: dict = {}
    for kaggle_col, our_col in KAGGLE_COLUMN_MAP.items():
        if kaggle_col not in raw.columns:
            continue

        series = pd.to_numeric(raw[kaggle_col], errors="coerce").dropna()
        if series.empty:
            continue

        # Normalize 0-10 scales to 0-1
        if series.max() > 1.5:
            series = series / 10.0

        distributions[our_col] = {
            "mean": float(series.mean()),
            "std": float(series.std()),
            "min": float(series.min()),
            "max": float(series.max()),
        }

    if distributions:
        print(f"[hybrid] Extracted distributions for: {list(distributions.keys())}")
        return distributions

    print("[hybrid] No matching columns found -- falling back to synthetic-only.")
    return None


# ---------------------------------------------------------------------------
# Feature generation
# ---------------------------------------------------------------------------

def generate_features(n: int, rng: np.random.Generator, kaggle_dist: dict | None) -> pd.DataFrame:
    """Generate input features for n samples."""

    # distance_km: log-normal centered around 350km
    distance_km = rng.lognormal(mean=5.7, sigma=0.65, size=n)
    distance_km = np.clip(distance_km, 50, 2000)

    # weather_risk_score: beta distribution (most days are OK, some are bad)
    if kaggle_dist and "weather_risk_score" in kaggle_dist:
        d = kaggle_dist["weather_risk_score"]
        weather = rng.normal(loc=d["mean"], scale=d["std"], size=n)
    else:
        weather = rng.beta(a=2.0, b=5.0, size=n)
    weather = np.clip(weather, 0.0, 1.0)

    # traffic_risk_score: beta distribution
    if kaggle_dist and "traffic_risk_score" in kaggle_dist:
        d = kaggle_dist["traffic_risk_score"]
        traffic = rng.normal(loc=d["mean"], scale=d["std"], size=n)
    else:
        traffic = rng.beta(a=2.5, b=4.0, size=n)
    traffic = np.clip(traffic, 0.0, 1.0)

    # congestion_score: beta distribution
    if kaggle_dist and "congestion_score" in kaggle_dist:
        d = kaggle_dist["congestion_score"]
        congestion = rng.normal(loc=d["mean"], scale=d["std"], size=n)
    else:
        congestion = rng.beta(a=2.0, b=5.0, size=n)
    congestion = np.clip(congestion, 0.0, 1.0)

    # disruptions_count: mostly 0, sometimes 1-2, rarely 3+
    disruptions = rng.choice(
        [0, 1, 2, 3, 4, 5],
        size=n,
        p=[0.50, 0.25, 0.13, 0.07, 0.03, 0.02],
    )

    # priority
    priority = rng.choice(PRIORITIES, size=n, p=PRIORITY_WEIGHTS)

    # current_eta_minutes: correlated with distance
    speed_factor = rng.uniform(1.1, 1.8, size=n)
    current_eta_minutes = distance_km * speed_factor
    current_eta_minutes = np.clip(current_eta_minutes, 60, 2800)

    return pd.DataFrame({
        "distance_km": np.round(distance_km, 1),
        "weather_risk_score": np.round(weather, 4),
        "traffic_risk_score": np.round(traffic, 4),
        "congestion_score": np.round(congestion, 4),
        "disruptions_count": disruptions.astype(int),
        "priority": priority,
        "current_eta_minutes": np.round(current_eta_minutes, 1),
    })


# ---------------------------------------------------------------------------
# Target generation (matches backend aiService.ts formulas + noise)
# ---------------------------------------------------------------------------

def compute_targets(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """
    Compute delay_probability, is_delayed, actual_delay_min, risk_level.

    Uses the SAME formula as backend/src/services/aiService.ts predictDelay()
    plus Gaussian noise so the ML model learns patterns, not memorizes the formula.
    """
    n = len(df)

    distance = df["distance_km"].values
    weather = df["weather_risk_score"].values
    traffic = df["traffic_risk_score"].values
    congestion = df["congestion_score"].values
    disruptions = df["disruptions_count"].values.astype(float)
    eta = df["current_eta_minutes"].values
    priority_factor = df["priority"].map(PRIORITY_FACTOR).values

    # delay_probability: backend formula + noise
    base_prob = (
        0.05
        + weather * 0.25
        + traffic * 0.25
        + congestion * 0.18
        + disruptions * 0.08
        + (distance / 1200.0) * 0.12
        + priority_factor
    )
    noise = rng.normal(0, 0.08, size=n)
    delay_probability = np.clip(base_prob + noise, 0.01, 0.99)

    # is_delayed: probabilistic (not a hard threshold)
    random_roll = rng.uniform(0, 1, size=n)
    is_delayed = (random_roll < delay_probability).astype(int)

    # actual_delay_min: backend formula + noise, 0 if not delayed
    base_delay = (
        delay_probability * (eta * 0.35)
        + disruptions * 22
        + weather * 30
        + traffic * 24
        + congestion * 18
    )
    delay_noise = rng.normal(0, 15, size=n)
    actual_delay_min = np.maximum(0, base_delay + delay_noise)
    actual_delay_min = np.where(is_delayed == 1, actual_delay_min, 0.0)
    actual_delay_min = np.round(actual_delay_min, 1)

    # risk_level: from delay_probability (matches backend thresholds)
    risk_level = np.where(
        delay_probability >= 0.8, "critical",
        np.where(
            delay_probability >= 0.6, "high",
            np.where(
                delay_probability >= 0.35, "medium",
                "low"
            )
        )
    )

    return pd.DataFrame({
        "is_delayed": is_delayed,
        "actual_delay_min": actual_delay_min,
        "delay_probability": np.round(delay_probability, 4),
        "risk_level": risk_level,
    })


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_dataset(df: pd.DataFrame) -> None:
    """Sanity-check the generated dataset."""
    assert set(df.columns) == {
        "distance_km", "weather_risk_score", "traffic_risk_score",
        "congestion_score", "disruptions_count", "priority",
        "current_eta_minutes", "is_delayed", "actual_delay_min",
        "delay_probability", "risk_level",
    }, f"Column mismatch: {set(df.columns)}"

    assert df["distance_km"].between(50, 2000).all()
    assert df["weather_risk_score"].between(0, 1).all()
    assert df["traffic_risk_score"].between(0, 1).all()
    assert df["congestion_score"].between(0, 1).all()
    assert df["disruptions_count"].between(0, 5).all()
    assert set(df["priority"].unique()).issubset(set(PRIORITIES))
    assert df["current_eta_minutes"].between(60, 2800).all()
    assert set(df["is_delayed"].unique()).issubset({0, 1})
    assert (df["actual_delay_min"] >= 0).all()
    assert set(df["risk_level"].unique()).issubset(set(RISK_LEVELS))
    assert df["delay_probability"].between(0, 1).all()

    delay_rate = df["is_delayed"].mean()
    assert 0.20 < delay_rate < 0.65, f"Unrealistic delay rate: {delay_rate:.2%}"

    print(f"[validate] All checks passed for {len(df):,} rows.")


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------

def print_summary(df: pd.DataFrame) -> None:
    """Print dataset summary."""
    n = len(df)
    print("\n" + "=" * 60)
    print(f"  DATASET SUMMARY -- {n:,} rows")
    print("=" * 60)

    print(f"\n  Delayed:     {df['is_delayed'].sum():>6,} ({df['is_delayed'].mean():.1%})")
    print(f"  Not delayed: {(1 - df['is_delayed']).sum():>6,.0f} ({1 - df['is_delayed'].mean():.1%})")

    print(f"\n  Risk distribution:")
    for level in RISK_LEVELS:
        count = (df["risk_level"] == level).sum()
        print(f"    {level:<10} {count:>6,} ({count / n:.1%})")

    print(f"\n  Priority distribution:")
    for p in PRIORITIES:
        count = (df["priority"] == p).sum()
        print(f"    {p:<10} {count:>6,} ({count / n:.1%})")

    print(f"\n  Feature ranges:")
    for col in ["distance_km", "weather_risk_score", "traffic_risk_score",
                "congestion_score", "current_eta_minutes", "actual_delay_min"]:
        print(f"    {col:<25} min={df[col].min():>8.1f}  mean={df[col].mean():>8.1f}  max={df[col].max():>8.1f}")

    print(f"\n  Disruptions distribution:")
    for i in range(6):
        count = (df["disruptions_count"] == i).sum()
        print(f"    {i} disruptions: {count:>6,} ({count / n:.1%})")

    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate supply chain training data")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS,
                        help=f"Number of rows (default: {DEFAULT_ROWS:,})")
    parser.add_argument("--seed", type=int, default=SEED,
                        help=f"Random seed (default: {SEED})")
    parser.add_argument("--kaggle", type=str, default=None,
                        help="Path to Kaggle CSV for hybrid calibration")
    parser.add_argument("--output", type=str, default=None,
                        help="Output CSV path")
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    n = args.rows
    out_path = Path(args.output) if args.output else OUTPUT_FILE

    print(f"[generate] Generating {n:,} rows (seed={args.seed}) ...")

    # Try hybrid Kaggle calibration
    kaggle_path = args.kaggle
    if kaggle_path is None:
        auto_path = OUTPUT_DIR / "kaggle_raw.csv"
        if auto_path.is_file():
            kaggle_path = str(auto_path)
    kaggle_dist = try_load_kaggle(kaggle_path)

    if kaggle_dist:
        print("[generate] HYBRID MODE -- using Kaggle distributions for calibration")
    else:
        print("[generate] SYNTHETIC MODE -- using hand-tuned distributions")

    # Generate
    features = generate_features(n, rng, kaggle_dist)
    targets = compute_targets(features, rng)
    df = pd.concat([features, targets], axis=1)

    # Validate
    validate_dataset(df)

    # Save
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    file_size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[generate] Saved to {out_path} ({file_size_mb:.1f} MB)")

    # Summary
    print_summary(df)


if __name__ == "__main__":
    main()
