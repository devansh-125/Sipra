"""
Anomaly Detection Dataset Generator
====================================

Generates synthetic supply-chain metric snapshots for training an anomaly
detection model.  Matches the backend's detectAnomaly() heuristic schema.

Backend contract (aiService.ts):
  Input:  { metrics: Record<string, number>, threshold: number }
  Output: { anomaly_score, threshold, is_anomaly, top_indicators[], model }

Heuristic formula:
  anomaly_score = mean(clamp(each_metric, 0, 1))
  is_anomaly    = anomaly_score >= threshold

Metrics we generate (all 0-1 after normalisation):
  delivery_time_deviation   – how late/early vs ETA
  order_volume_spike        – unusual order volume
  inventory_level           – stock level (low = risky)
  supplier_lead_time        – supplier responsiveness
  defect_rate               – product quality issues
  transport_cost_ratio      – cost vs normal range
  weather_severity          – weather risk
  port_congestion           – port utilisation

Output CSV columns:
  <8 metric columns>  float 0-1
  anomaly_score       float 0-1
  threshold           float (fixed 0.7 unless overridden)
  is_anomaly          int   0/1

Usage:
  cd ai-service
  python training/anomaly/generate_data.py
  python training/anomaly/generate_data.py --rows 20000
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
DEFAULT_ROWS = 20_000
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "anomaly"
OUTPUT_FILE = OUTPUT_DIR / "supply_chain_anomalies.csv"

DEFAULT_THRESHOLD = 0.7

# Metric names matching what the backend might send
METRICS = [
    "delivery_time_deviation",
    "order_volume_spike",
    "inventory_level",
    "supplier_lead_time",
    "defect_rate",
    "transport_cost_ratio",
    "weather_severity",
    "port_congestion",
]

# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def generate_anomaly_data(n: int, rng: np.random.Generator, threshold: float) -> pd.DataFrame:
    """
    Generate metric snapshots.

    ~80% are NORMAL (low metric values) and ~20% are ANOMALOUS (elevated metrics).
    This gives the model realistic class imbalance — anomalies are rare.
    """
    n_normal = int(n * 0.80)
    n_anomaly = n - n_normal

    rows = {}

    for metric in METRICS:
        # Normal samples: beta(2, 8) → mean ~0.20, most values under 0.5
        normal_vals = rng.beta(a=2, b=8, size=n_normal)

        # Anomaly samples: beta(6, 3) → mean ~0.67, many values above threshold
        anomaly_vals = rng.beta(a=6, b=3, size=n_anomaly)

        rows[metric] = np.concatenate([normal_vals, anomaly_vals])

    df = pd.DataFrame(rows)

    # Shuffle so normal/anomaly aren't grouped
    df = df.sample(frac=1, random_state=rng.integers(1e9)).reset_index(drop=True)

    # Round to 4 decimals
    for col in METRICS:
        df[col] = np.round(df[col], 4)

    # Compute targets (matches backend heuristic — deterministic, NO noise)
    metric_values = df[METRICS].values
    anomaly_score = np.clip(metric_values.mean(axis=1), 0.0, 1.0)

    df["anomaly_score"] = np.round(anomaly_score, 4)
    df["threshold"] = threshold
    df["is_anomaly"] = (anomaly_score >= threshold).astype(int)

    return df


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(df: pd.DataFrame, threshold: float) -> None:
    expected_cols = set(METRICS) | {"anomaly_score", "threshold", "is_anomaly"}
    assert set(df.columns) == expected_cols, f"Column mismatch: {set(df.columns)}"

    for m in METRICS:
        assert df[m].between(0, 1).all(), f"{m} out of range"

    assert df["anomaly_score"].between(0, 1).all()
    assert set(df["is_anomaly"].unique()).issubset({0, 1})

    anomaly_rate = df["is_anomaly"].mean()
    assert 0.05 < anomaly_rate < 0.50, f"Unrealistic anomaly rate: {anomaly_rate:.2%}"

    print(f"[validate] All checks passed for {len(df):,} rows.")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(df: pd.DataFrame) -> None:
    n = len(df)
    print("\n" + "=" * 60)
    print(f"  ANOMALY DATASET SUMMARY -- {n:,} rows")
    print("=" * 60)

    anom = df["is_anomaly"].sum()
    print(f"\n  Anomalies:     {anom:>6,} ({anom / n:.1%})")
    print(f"  Normal:        {n - anom:>6,} ({(n - anom) / n:.1%})")

    print(f"\n  Anomaly score:  min={df['anomaly_score'].min():.3f}  "
          f"mean={df['anomaly_score'].mean():.3f}  max={df['anomaly_score'].max():.3f}")

    print(f"\n  Metric ranges:")
    for m in METRICS:
        print(f"    {m:<30} min={df[m].min():.3f}  mean={df[m].mean():.3f}  max={df[m].max():.3f}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate anomaly detection training data")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    out_path = Path(args.output) if args.output else OUTPUT_FILE

    print(f"[generate] Generating {args.rows:,} anomaly rows (seed={args.seed}, threshold={args.threshold}) ...")

    df = generate_anomaly_data(args.rows, rng, args.threshold)
    validate(df, args.threshold)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[generate] Saved to {out_path} ({mb:.1f} MB)")

    print_summary(df)


if __name__ == "__main__":
    main()
