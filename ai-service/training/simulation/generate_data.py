"""
Generate synthetic disruption-simulation data.

Each row represents a disruption event with known impact outcomes.
The relationships are richer than the backend heuristic fallback:

  heuristic:
      impacted_shipments = severity*2 + radius/5
      delay_min           = severity*8  + radius*0.6

  ML targets add type-specific multipliers, time-of-day effects,
  and non-linear severity interactions — all deterministic (no noise
  on targets).

Output: training/simulation/data/simulation_data.csv
"""

from __future__ import annotations
import os, pathlib, numpy as np, pandas as pd

SEED = 42
N_ROWS = 20_000
TYPES = ["weather", "congestion", "blockage", "vehicle_issue"]

# ── Type-specific multipliers ────────────────────────────────────
# shipments multiplier / delay multiplier
TYPE_SHIP = {"weather": 1.30, "congestion": 1.50, "blockage": 0.80, "vehicle_issue": 0.40}
TYPE_DELAY = {"weather": 1.00, "congestion": 1.20, "blockage": 2.00, "vehicle_issue": 0.50}


def generate(n: int = N_ROWS, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # ── Features ────────────────────────────────────────────────
    types = rng.choice(TYPES, size=n)
    severity = rng.integers(1, 11, size=n).astype(float)           # 1-10
    radius_km = np.round(rng.uniform(1, 120, size=n), 1)           # 1-120 km
    hour = rng.integers(0, 24, size=n).astype(float)               # 0-23

    # ── Derived helpers ─────────────────────────────────────────
    type_ship_mult = np.array([TYPE_SHIP[t] for t in types])
    type_delay_mult = np.array([TYPE_DELAY[t] for t in types])

    # Rush-hour boost (07-09 & 17-19) — only for congestion & weather
    is_rush = ((hour >= 7) & (hour <= 9)) | ((hour >= 17) & (hour <= 19))
    rush_mult = np.where(
        is_rush & np.isin(types, ["congestion", "weather"]),
        1.30, 1.0
    )

    # Severity interaction: blockage at severity ≥ 8 causes extra delay
    blockage_extra = np.where(
        (np.array(types) == "blockage") & (severity >= 8),
        severity * 5,  # extra 40-50 min
        0.0,
    )

    # ── Targets (deterministic) ─────────────────────────────────
    base_shipments = severity * 2 + radius_km / 5
    impacted_shipments = np.maximum(
        1, np.round(base_shipments * type_ship_mult * rush_mult)
    ).astype(int)

    base_delay = severity * 8 + radius_km * 0.6
    delay_min = np.maximum(
        1, np.round(base_delay * type_delay_mult * rush_mult + blockage_extra)
    ).astype(int)

    # ── Feature noise (on features only, NOT targets) ───────────
    severity_noisy = np.clip(
        severity + rng.normal(0, 0.15, n), 1, 10
    ).round(2)
    radius_noisy = np.clip(
        radius_km + rng.normal(0, 1.5, n), 1, 120
    ).round(2)

    # ── Encode type as integers ─────────────────────────────────
    type_map = {t: i for i, t in enumerate(TYPES)}
    type_encoded = np.array([type_map[t] for t in types])

    df = pd.DataFrame({
        "type":              types,
        "type_encoded":      type_encoded,
        "severity":          severity_noisy,
        "affected_radius_km": radius_noisy,
        "hour":              hour,
        "impacted_shipments": impacted_shipments,
        "delay_min":         delay_min,
    })
    return df


def main() -> None:
    out_dir = pathlib.Path(__file__).resolve().parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "simulation_data.csv"

    df = generate()
    df.to_csv(out_path, index=False)

    print(f"Saved {len(df)} rows → {out_path}")
    print(f"  Types distribution:\n{df['type'].value_counts().to_string()}")
    print(f"  impacted_shipments: mean={df['impacted_shipments'].mean():.1f}, "
          f"min={df['impacted_shipments'].min()}, max={df['impacted_shipments'].max()}")
    print(f"  delay_min:          mean={df['delay_min'].mean():.1f}, "
          f"min={df['delay_min'].min()}, max={df['delay_min'].max()}")


if __name__ == "__main__":
    main()
