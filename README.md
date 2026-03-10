# Pakistan Forest Structure Mapping

Wall-to-wall **canopy cover** and **canopy height** maps for Pakistan, generated using Google Earth Engine, Landsat / Sentinel-2 satellite imagery, and Random Forest regression.

---

## Output Maps

The two national-scale raster outputs are stored in `data/`:

| File | Description | Resolution |
|---|---|---|
| `pakistan_canopy_cover_30m.tif` | Predicted tree canopy cover (%) | 30 m |
| `pakistan_canopy_height_30m.tif` | Predicted canopy height (m) | 30 m |

### Visualisation

| Layer | Colour scale | Range |
|---|---|---|
| Canopy Cover | White → Green | 0 – 100 % |
| Canopy Height | White → Red | 0 – 44.5 m |

Preview renders are in [`maps/`](maps/).

---

## Architecture Overview

```
Google Earth Engine (GEE)
        │
        ├── Forest Mask Construction
        ├── Predictor Stack (spectral + terrain)
        ├── Stratified Sample Export  →  CSV per region
        │
        └── Wall-to-wall Prediction  →  GeoTIFF export

Python (local)
        ├── merge_exports.py  — combine per-region CSVs → training CSV
        ├── train_model.py    — train Random Forest, save metrics
        └── merge_tiles.py    — mosaic GEE GeoTIFF tiles → single file
```

---

## Data Sources

| Source | GEE Asset | Use |
|---|---|---|
| Pakistan LULC 2020 | `projects/adk-crash-course-471706/assets/lulc2020` | Forest extent mask |
| Hansen Global Forest Change v1.12 | `UMD/hansen/global_forest_change_2024_v1_12` | Forest mask + canopy cover label |
| ETH Global Canopy Height 2020 | `users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1` | Canopy height label |
| Landsat 5 / Landsat 7 Collection 2 | `LANDSAT/LT05/C02/T1_L2`, `LANDSAT/LE07/C02/T1_L2` | Spectral predictors for cover model |
| Sentinel-2 SR Harmonised | `COPERNICUS/S2_SR_HARMONIZED` | Spectral predictors for height model |
| SRTM DEM | `USGS/SRTMGL1_003` | Terrain predictors (both models) |

---

## Forest Mask

A combined forest mask is applied during sampling and prediction:

```
FinalForestMask = (LULC == 1)  OR  (Hansen treecover2000 ≥ 25%  AND  lossyear == 0)
```

The union is used because Pakistan's forests are often fragmented and low-density; relying on either dataset alone would miss significant forest area.

---

## Temporal Alignment

Each model is trained on imagery that matches the year of its label to avoid temporal mismatch:

| Model | Input Imagery | Period | Label | Label Year |
|---|---|---|---|---|
| Canopy Cover | Landsat 5 + Landsat 7 | 1998 – 2004 (Apr–Oct median) | Hansen `treecover2000` | 2000 |
| Canopy Height | Sentinel-2 SR | 2019 – 2021 (Apr–Oct median) | ETH canopy height | 2020 |

Only April–October acquisitions are used to avoid winter cloud and snow contamination at high elevations.

---

## Predictor Stack (11 features)

Both models use the same feature space, derived from the respective imagery:

```
Blue, Green, Red, NIR, SWIR1, SWIR2   ← 6 spectral bands
NDVI  = (NIR − Red)  / (NIR + Red)
NDMI  = (NIR − SWIR1) / (NIR + SWIR1)
Elevation, Slope, Aspect               ← SRTM terrain
```

---

## Training Data

### Sampling Strategy

Pakistan is predominantly desert and cropland, so random sampling would produce almost no forest pixels. A **stratified ecological sampling** approach was used across five forest ecosystem regions:

| Script | Region | Ecosystem | Bounding Box (lon/lat) |
|---|---|---|---|
| `01_himalayan` | Chitral / Upper Swat | High-altitude conifer | [71.0, 34.8 → 73.5, 36.2] |
| `02_temperate` | Swat / Dir | Mixed temperate forest | [73.2, 33.8 → 74.5, 35.0] |
| `03_subtropical_pine` | Murree / Margalla Hills | Subtropical pine | [72.8, 33.4 → 73.9, 34.6] |
| `04_riverine` | Indus floodplain | Riverine / riparian | [72.8, 33.8 → 75.0, 35.5] |
| `05_kaghan` | Kaghan Valley | Sub-alpine mixed | [73.5, 34.2 → 75.5, 36.5] |
| `06_non_forest` | Whole Pakistan | Desert / barren / cropland | Pakistan boundary |

### Strata per forest region

Each forest region is internally stratified to ensure cover of sparse, moderate and dense forest:

| Stratum | Canopy Cover range | Canopy Height range | Points per stratum |
|---|---|---|---|
| 1 — Sparse | < 30 % | < 5 m | 1 500 |
| 2 — Moderate | 30 – 60 % | 5 – 15 m | 1 500 |
| 3 — Dense | ≥ 60 % | ≥ 15 m | 1 500 |

Non-forest samples: **5 000** points drawn uniformly across Pakistan (inverted forest mask).

### Final dataset sizes

| Model | Total rows |
|---|---|
| Canopy Cover | 19 609 |
| Canopy Height | 16 649 |

### Train / Val / Test split

Split is deterministic, using a `randomColumn('split')` value exported with each sample:

| Set | Range | Proportion |
|---|---|---|
| Train | split < 0.70 | 70 % |
| Val | 0.70 ≤ split < 0.85 | 15 % |
| Test | split ≥ 0.85 | 15 % |

---

## Model

**Algorithm:** Random Forest Regression (`sklearn.ensemble.RandomForestRegressor`)

**Hyperparameters (both models):**

| Parameter | Value |
|---|---|
| `n_estimators` | 300 |
| `max_features` | `sqrt` |
| `min_samples_leaf` | 5 |
| `random_state` | 42 |
| `oob_score` | True |

Both MDI feature importances and **permutation importances** on the validation set are recorded.

---

## Results

### Canopy Cover Model

| Set | MAE (%) | RMSE (%) | R² |
|---|---|---|---|
| Train | 6.67 | 10.64 | 0.914 |
| Val | 9.60 | 15.08 | 0.828 |
| **Test** | **9.07** | **14.34** | **0.844** |
| OOB | — | — | 0.833 |

Top predictors (permutation importance on val set): `Blue` (0.213) → `Red` (0.147) → `Green` (0.137) → `Elevation` (0.080)

### Canopy Height Model

| Set | MAE (m) | RMSE (m) | R² |
|---|---|---|---|
| Train | 1.89 | 2.94 | 0.961 |
| Val | 2.63 | 4.01 | 0.925 |
| **Test** | **2.64** | **4.04** | **0.926** |
| OOB | — | — | 0.921 |

Top predictors (permutation importance on val set): `Elevation` (0.178) → `NDVI` (0.145) → `Red` (0.077) → `Slope` (0.075)

---

## Prediction

After training locally, the classifier is re-trained inside GEE on the full training CSV (uploaded as a Table asset) and applied wall-to-wall over Pakistan at **30 m** resolution.

The prediction pipeline (`07_predict_pakistan.js`) builds the identical predictor stack, classifies every pixel, clamps output to valid range, and exports to Google Drive.

Exported GeoTIFF tiles are merged locally using `merge_tiles.py` (rasterio mosaic with deflate compression).

---

## Repository Structure

```
canopy_cover/
  gee_scripts/          GEE JavaScript — sampling (01–06) + prediction (07)
  data/
    raw_exports/        Per-region CSVs downloaded from Google Drive
    canopy_cover_training.csv   Merged training dataset
  models/
    canopy_cover_rf.joblib      Trained model
    canopy_cover_rf_metrics.json  Evaluation metrics + feature importances
  merge_exports.py      Combines raw CSVs into training CSV
  train_model.py        Trains the RF model

canopy_height/          Identical structure for the height model

data/
  pakistan_canopy_cover_30m.tif    Final output — canopy cover map
  pakistan_canopy_height_30m.tif   Final output — canopy height map

maps/                   Visual renders of the output maps
merge_tiles.py          Mosaics GEE tile exports into single GeoTIFFs
```

---

## How to Reproduce

**1. Export training samples (GEE)**
Run scripts `01` through `06` in each `gee_scripts/` folder. Download the exported CSVs from Google Drive into `data/raw_exports/`.

**2. Merge exports**
```bash
python canopy_cover/merge_exports.py
python canopy_height/merge_exports.py
```

**3. Train models**
```bash
python canopy_cover/train_model.py
python canopy_height/train_model.py
```

**4. Predict over Pakistan (GEE)**
Upload the merged training CSVs as GEE Table assets, update `TRAINING_ASSET` in each `07_predict_pakistan.js`, then run and submit the export task.

**5. Merge output tiles**
```bash
python merge_tiles.py
```

---

## Dependencies

```
Python 3.10+
scikit-learn
pandas
numpy
rasterio
joblib
```