"""
Merge the 6 downloaded CSVs into one training dataset.

Usage:
    Place all 6 CSVs in canopy_cover/data/raw_exports/
    then run:  python canopy_cover/merge_exports.py
"""

import pandas as pd
import glob
import os

RAW_DIR    = os.path.join(os.path.dirname(__file__), "data", "raw_exports")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "data", "canopy_cover_training.csv")

csv_files = sorted(glob.glob(os.path.join(RAW_DIR, "canopy_cover_0*.csv")))

if not csv_files:
    raise FileNotFoundError(f"No CSVs found in {RAW_DIR}")

dfs = [pd.read_csv(f) for f in csv_files]
for f, df in zip(csv_files, dfs):
    print(f"  {os.path.basename(f)}: {len(df)} rows")

combined = pd.concat(dfs, ignore_index=True)

# Drop GEE geometry columns if present
combined.drop(columns=[c for c in combined.columns
                        if c.lower() in ('.geo', 'system:index')], errors='ignore', inplace=True)

combined.to_csv(OUTPUT_CSV, index=False)
print(f"\nMerged {len(combined)} total rows → {OUTPUT_CSV}")
print(combined["sampling_group"].value_counts())
