"""
Merge GEE export tiles into single GeoTIFFs.

Usage:
    1. Download all tiles from Google Drive into a local folder.
    2. Update TILES_DIR below (or pass as command-line argument).
    3. Run:  python merge_tiles.py
             python merge_tiles.py "C:/path/to/tiles"

Output (written next to the tiles):
    pakistan_canopy_cover_30m.tif
    pakistan_canopy_height_30m.tif
"""

import os
import sys
import glob
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.transform import array_bounds

# ── UPDATE THIS ───────────────────────────────────────────────
TILES_DIR = r"C:\Users\hanzlak\Documents\Joblogic\forestry\data"
# ─────────────────────────────────────────────────────────────

if len(sys.argv) > 1:
    TILES_DIR = sys.argv[1]

JOBS = [
    {
        "pattern": "pakistan_canopy_cover_30m-*.tif",
        "output":  "pakistan_canopy_cover_30m.tif",
        "label":   "Canopy Cover (%)",
        "vmin": 0, "vmax": 100,
    },
    {
        "pattern": "pakistan_canopy_height_30m-*.tif",
        "output":  "pakistan_canopy_height_30m.tif",
        "label":   "Canopy Height (m)",
        "vmin": 0, "vmax": 55,
    },
]


def merge_tiles(tile_paths: list[str], out_path: str) -> None:
    datasets = [rasterio.open(p) for p in tile_paths]
    mosaic, transform = merge(datasets)
    meta = datasets[0].meta.copy()
    meta.update({
        "driver":    "GTiff",
        "height":    mosaic.shape[1],
        "width":     mosaic.shape[2],
        "transform": transform,
        "compress":  "deflate",
        "predictor": 2,        # predictor=2 suits continuous float data
        "tiled":     True,
        "blockxsize": 512,
        "blockysize": 512,
    })
    with rasterio.open(out_path, "w", **meta) as dst:
        dst.write(mosaic)
    for ds in datasets:
        ds.close()


def print_stats(path: str, label: str) -> None:
    with rasterio.open(path) as src:
        # GEE exports float NaN for no-data; nodata flag is often unset in metadata.
        # Read as plain array and treat NaN as no-data ourselves.
        raw = src.read(1).astype(np.float32)
        nan_mask = np.isnan(raw)
        total   = raw.size
        n_nan   = int(nan_mask.sum())
        n_valid = total - n_nan
        valid   = raw[~nan_mask]
        bounds  = src.bounds
        print(f"  file     : {os.path.basename(path)}")
        print(f"  size     : {os.path.getsize(path) / 1e6:.1f} MB")
        print(f"  shape    : {src.height} rows x {src.width} cols")
        print(f"  bounds   : W={bounds.left:.3f} S={bounds.bottom:.3f} "
              f"E={bounds.right:.3f} N={bounds.top:.3f}")
        print(f"  valid px : {n_valid:,}  ({100*n_valid/total:.1f}%)")
        print(f"  nan px   : {n_nan:,}  ({100*n_nan/total:.1f}%)")
        print(f"  {label}")
        if n_valid == 0:
            print("    (no valid pixels)")
        else:
            print(f"    min    : {valid.min():.2f}")
            print(f"    max    : {valid.max():.2f}")
            print(f"    mean   : {valid.mean():.2f}")
            print(f"    median : {np.median(valid):.2f}")
            print(f"    p95    : {np.percentile(valid, 95):.2f}")


def main():
    print(f"Tiles directory: {TILES_DIR}\n")
    if not os.path.isdir(TILES_DIR):
        raise FileNotFoundError(f"Tiles directory not found: {TILES_DIR}")

    for job in JOBS:
        tiles = sorted(glob.glob(os.path.join(TILES_DIR, job["pattern"])))
        if not tiles:
            print(f"[SKIP] No tiles found for pattern: {job['pattern']}\n")
            continue

        out_path = os.path.join(TILES_DIR, job["output"])
        if os.path.exists(out_path):
            print(f"Output already exists, skipping merge -> {job['output']}")
        else:
            print(f"Merging {len(tiles)} tiles -> {job['output']}")
            for t in tiles:
                print(f"  + {os.path.basename(t)}")
            merge_tiles(tiles, out_path)
            print(f"  Saved: {out_path}")
            print(f"  Output size: {os.path.getsize(out_path) / 1e6:.1f} MB")
        print()
        print("Stats:")
        print_stats(out_path, job["label"])
        print()


if __name__ == "__main__":
    main()
