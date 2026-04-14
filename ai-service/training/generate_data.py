"""
Delay Prediction Dataset Generator (v2 — clean labels)
========================================================
Generates 30,000 rows matching backend aiService.ts schema exactly.

Key design decisions:
  - NO noise on targets (delay_probability computed cleanly from features)
  - Variance comes from FEATURES, not labels (realistic measurement spread)
  - Non-linear interactions (weather×traffic, disruptions×congestion) so model
    learns real patterns, not just a linear formula → prevents overfitting
  - is_delayed is deterministic (threshold 0.5) with narrow uncertainty band
    (0.45-0.55) where borderline cases get realistic randomness
  - Cross-validation in training proves generalisation, not memorisation

Usage:
  cd ai-service && python training/generate_data.py
"""

from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import pandas as pd

SEED = 42
DEFAULT_ROWS = 30_000
OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_FILE = OUTPUT_DIR / "supply_chain_data.csv"

PRIORITIES = ["low", "medium", "high", "critical"]
PRIORITY_WEIGHTS = [0.20, 0.45, 0.25, 0.10]
PRIORITY_FACTOR = {"low": 0.0, "medium": 0.02, "high": 0.04, "critical": 0.06}
RISK_LEVELS = ["low", "medium", "high", "critical"]


def generate_features(n: int, rng: np.random.Generator) -> pd.DataFrame:
    distance_km = np.clip(rng.lognormal(5.7, 0.65, n), 50, 2000)
    weather = np.clip(rng.beta(2.0, 5.0, n), 0, 1)
    traffic = np.clip(rng.beta(2.5, 4.0, n), 0, 1)
    congestion = np.clip(rng.beta(2.0, 5.0, n), 0, 1)
    disruptions = rng.choice([0, 1, 2, 3, 4, 5], n, p=[.50, .25, .13, .07, .03, .02])
    priority = rng.choice(PRIORITIES, n, p=PRIORITY_WEIGHTS)
    eta = np.clip(distance_km * rng.uniform(1.1, 1.8, n), 60, 2800)

    return pd.DataFrame({
        "distance_km": np.round(distance_km, 1),
        "weather_risk_score": np.round(weather, 4),
        "traffic_risk_score": np.round(traffic, 4),
        "congestion_score": np.round(congestion, 4),
        "disruptions_count": disruptions.astype(int),
        "priority": priority,
        "current_eta_minutes": np.round(eta, 1),
    })


def compute_targets(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """
    Compute targets with CLEAN labels.

    Noise strategy:
      - delay_probability: computed cleanly from features (NO Gaussian noise)
      - Non-linear interactions make the relationship complex enough that
        a model must learn real patterns, not memorise a linear formula
      - is_delayed: deterministic threshold (>= 0.5 = delayed), with only
        a narrow uncertainty band (0.45-0.55) where ~30% flip randomly
        (simulating real-world borderline cases that could go either way)
      - actual_delay_min: small noise (σ=5min) to simulate real measurement
        variance, but NOT the σ=15min that destroyed signal before
    """
    n = len(df)
    d = df["distance_km"].values
    w = df["weather_risk_score"].values
    t = df["traffic_risk_score"].values
    c = df["congestion_score"].values
    dis = df["disruptions_count"].values.astype(float)
    eta = df["current_eta_minutes"].values
    pf = df["priority"].map(PRIORITY_FACTOR).values

    # ── delay_probability: backend formula + non-linear interactions ──
    # Base linear terms (same weights as backend)
    linear = 0.05 + w*0.25 + t*0.25 + c*0.18 + dis*0.08 + (d/1200)*0.12 + pf

    # Non-linear interactions (these make the pattern complex enough to
    # prevent overfitting while keeping it learnable — tree models are
    # great at capturing interactions like these)
    interactions = (
        w * t * 0.10            # bad weather + bad traffic compound
        + dis * c * 0.05        # disruptions hit harder when congested
        + (d / 2000) * w * 0.04 # long distance + bad weather is worse
        + np.where(dis >= 3, 0.08, 0.0)  # threshold effect: 3+ disruptions
    )

    delay_probability = np.clip(linear + interactions, 0.01, 0.99)

    # ── is_delayed: deterministic threshold + narrow uncertainty band ──
    is_delayed = np.where(delay_probability >= 0.55, 1, 0)  # clearly delayed
    is_delayed = np.where(delay_probability < 0.40, 0, is_delayed)  # clearly OK

    # Uncertainty band (0.40-0.55): ~40% chance of being delayed
    # (simulates real borderline cases — these exist in real logistics)
    borderline = (delay_probability >= 0.40) & (delay_probability < 0.55)
    borderline_roll = rng.uniform(0, 1, n)
    is_delayed = np.where(borderline, (borderline_roll < 0.4).astype(int), is_delayed)

    # ── actual_delay_min: clean formula + small measurement noise ──
    base_delay = (
        delay_probability * (eta * 0.35)
        + dis * 22
        + w * 30
        + t * 24
        + c * 18
    )
    # Small noise (σ=5min) — realistic sensor/reporting variance
    actual_delay = np.maximum(0, base_delay + rng.normal(0, 5, n))
    actual_delay = np.where(is_delayed == 1, actual_delay, 0.0)

    # ── risk_level: from delay_probability (matches backend thresholds) ──
    risk_level = np.where(delay_probability >= 0.8, "critical",
                 np.where(delay_probability >= 0.6, "high",
                 np.where(delay_probability >= 0.35, "medium", "low")))

    return pd.DataFrame({
        "is_delayed": is_delayed,
        "actual_delay_min": np.round(actual_delay, 1),
        "delay_probability": np.round(delay_probability, 4),
        "risk_level": risk_level,
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    print(f"[generate] Creating {args.rows:,} rows (seed={args.seed}) ...")

    features = generate_features(args.rows, rng)
    targets = compute_targets(features, rng)
    df = pd.concat([features, targets], axis=1)

    delay_rate = df["is_delayed"].mean()
    print(f"[generate] Delay rate: {delay_rate:.1%}")
    assert 0.15 < delay_rate < 0.60, f"Bad delay rate: {delay_rate:.2%}"

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)
    mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"[generate] Saved {OUTPUT_FILE} ({mb:.1f} MB, {len(df):,} rows)")

    for level in RISK_LEVELS:
        cnt = (df["risk_level"] == level).sum()
        print(f"  {level:<10} {cnt:>6,} ({cnt/len(df):.1%})")


if __name__ == "__main__":
    main()
