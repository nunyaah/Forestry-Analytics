# Forestry Analytics: National-Scale Canopy Cover and Canopy Height Mapping for Pakistan

A semester-long MS AI Capstone project focused on **forest structure estimation over Pakistan** using **Google Earth Engine (GEE)**, regional ecological sampling, and **Random Forest regression**. The project produces two national-scale geospatial products:

- **Canopy Cover (%)**
- **Canopy Height (m)**

The implementation emphasizes **methodological consistency**, **spatially aware evaluation**, and **ecological representativeness** across Pakistan’s highly heterogeneous forest systems, including dense northern conifer forests, riverine forests, subtropical pine, dry scrub woodland, mangroves, and juniper woodlands.

> **Important Scope Note**
>
> The final production workflow in this repository is **GEE-native** for model training and wall-to-wall inference.  
> Local Python in this repository is used primarily for **merging regional CSV exports into training tables** before upload to Earth Engine.  
> This README documents the **actual implementation present in the repository**.

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Research Motivation](#2-research-motivation)
- [3. Problem Formulation](#3-problem-formulation)
- [4. Study Area: Pakistan](#4-study-area-pakistan)
- [5. Repository Structure](#5-repository-structure)
- [6. End-to-End System Architecture](#6-end-to-end-system-architecture)
- [7. Data Sources](#7-data-sources)
- [8. Ecological Sampling Design](#8-ecological-sampling-design)
- [9. Preprocessing Pipeline](#9-preprocessing-pipeline)
- [10. Feature Engineering](#10-feature-engineering)
- [11. Training Data Assembly](#11-training-data-assembly)
- [12. Model Training in Google Earth Engine](#12-model-training-in-google-earth-engine)
- [13. Architectural Decisions and Rationale](#13-architectural-decisions-and-rationale)
- [14. Spatial Validation Strategy](#14-spatial-validation-strategy)
- [15. Results & Evaluation](#15-results--evaluation)
- [16. Error Analysis and Regional Variance](#16-error-analysis-and-regional-variance)
- [17. National Prediction Workflow](#17-national-prediction-workflow)
- [18. Final Outputs](#18-final-outputs)
- [19. Reproducibility Guide](#19-reproducibility-guide)
- [20. Limitations](#20-limitations)
- [21. Future Work](#21-future-work)
- [22. References](#22-references)
- [23. Bibliography](#23-bibliography)

---

## 1. Project Overview

This project develops a reproducible pipeline for **forest structure analytics** over Pakistan by combining:

- **remote sensing composites**
- **terrain features**
- **ecological-region stratified sampling**
- **Random Forest regression**
- **Google Earth Engine-native training and prediction**

Two distinct supervised learning tasks are modeled:

1. **Canopy Cover Estimation**
   - Label source: Hansen `treecover2000`
   - Training imagery: Landsat 5/7
   - Final prediction imagery: Sentinel-2 (aggregated/exported consistently for production)

2. **Canopy Height Estimation**
   - Label source: ETH Global Canopy Height 2020
   - Training imagery: Sentinel-2
   - Final prediction imagery: Sentinel-2

The final system is designed to support:

- national forest monitoring
- ecological zoning
- forest inventory proxy mapping
- landscape-scale planning
- downstream geospatial AI tasks

---

## 2. Research Motivation

Pakistan’s forest landscapes are **ecologically diverse** but **spatially sparse**. Forest structure varies strongly across:

- the Himalayan / Hindu Kush conifer belt
- mixed temperate forests
- subtropical pine
- riverine systems along the Indus
- dry scrub systems
- Indus Delta mangroves
- Balochistan juniper woodlands

A naive national sampling strategy would largely overrepresent:

- barren land
- desert
- cropland
- settlements

while underrepresenting the forest systems of greatest ecological interest.

This project addresses that challenge through:

- **region-specific ecological sampling**
- **stratified sampling by canopy structure**
- **spatial block train/validation/test splits**
- **careful treatment of sparse southern forests**

---

## 3. Problem Formulation

This repository frames forest structure mapping as **supervised regression**.

### 3.1 Canopy Cover
Predict a continuous value:

```text
canopy_cover ∈ [0, 100]
````

representing percentage tree canopy cover.

### 3.2 Canopy Height

Predict a continuous value:

```text
canopy_height ∈ [0, 50]
```

representing estimated canopy height in meters.

### 3.3 Why regression rather than segmentation

A semantic segmentation framing would require categorical forest classes or dense pixel-level class masks. Our target products are **continuous biophysical variables**, so regression is the correct formulation.

**Rationale:**
continuous canopy properties are better modeled directly as regression targets than through thresholded class prediction, which can lose ecological nuance and introduce arbitrary class boundaries [Belgiu & Drăguţ, 2016].

---

## 4. Study Area: Pakistan

Pakistan provides a challenging remote sensing environment because it combines:

* extreme elevation gradients
* snow-dominated alpine terrain
* humid and dry forest systems
* arid coastal environments
* fragmented riverine vegetation
* sparse woodland ecosystems

This makes the country an informative testbed for AI-based forest structure mapping.

### Key ecological systems represented

* **Northern conifer forests**
* **Temperate forests**
* **Subtropical pine forests**
* **Riverine forests**
* **Sub-alpine / Kaghan systems**
* **Dry scrub woodlands**
* **Indus Delta mangroves**
* **Ziarat juniper woodlands**

---

## 5. Repository Structure

```text
.
│   .gitignore
│   README.md
│
├── canopy_cover
│   │   merge_exports.py
│   └── gee_scripts
│       │   canopy_cover_pakistan_2025_growing_season.js
│       │   canopy_cover_train.js
│       │
│       └── sampling
│           │   00_southern_forests.js
│           │   01_himalayan.js
│           │   02_temperate.js
│           │   03_subtropical_pine.js
│           │   04_riverine.js
│           │   05_kaghan.js
│           │   06_non_forest.js
│           │   _shared_setup.js
│
└── canopy_height
    │   merge_exports.py
    └── gee_scripts
        │   canopy_height_pakistan_2025_growing_season.js
        │   canopy_height_train.js
        │
        └── sampling
            │   00_southern_forests.js
            │   01_himalayan.js
            │   02_temperate.js
            │   03_subtropical_pine.js
            │   04_riverine.js
            │   05_kaghan.js
            │   06_non_forest.js
            │   _shared_setup.js
```

### Structure Notes

* `merge_exports.py` merges regional CSV exports into a single training table.
* `gee_scripts/sampling/` contains all regional sampling scripts.
* `*_train.js` contains Earth Engine-native model training and evaluation.
* `*_pakistan_2025_growing_season.js` contains national prediction scripts.

---

## 6. End-to-End System Architecture

```text
Regional Ecological Sampling in GEE
        ↓
CSV export per region
        ↓
Local CSV merge
        ↓
Upload merged CSV as GEE Table Asset
        ↓
Train Random Forest in GEE
        ↓
Evaluate with spatial block split
        ↓
Export trained model as GEE asset
        ↓
Run national inference over Pakistan
        ↓
Export raster outputs to GEE assets
```

This architecture intentionally keeps **training and prediction in the same runtime ecosystem**.

**Rationale:**
Using Earth Engine for both training and deployment avoids implementation drift between local ML libraries and cloud geospatial inference engines [Gorelick et al., 2017].

---

## 7. Data Sources

| Source                            | Asset / Dataset                                    | Purpose                                              |
| --------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Pakistan boundary                 | `USDOS/LSIB_SIMPLE/2017`                           | National boundary                                    |
| Pakistan LULC 2020                | `projects/adk-crash-course-471706/assets/lulc2020` | Forest mask support                                  |
| Hansen Global Forest Change v1.12 | `UMD/hansen/global_forest_change_2024_v1_12`       | Canopy cover label and mask support                  |
| ETH Global Canopy Height 2020     | `users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1`   | Canopy height label                                  |
| Landsat 5 Collection 2 Level 2    | `LANDSAT/LT05/C02/T1_L2`                           | Cover model predictors                               |
| Landsat 7 Collection 2 Level 2    | `LANDSAT/LE07/C02/T1_L2`                           | Cover model predictors                               |
| Sentinel-2 SR Harmonized          | `COPERNICUS/S2_SR_HARMONIZED`                      | Height model predictors and final prediction imagery |
| SRTM DEM                          | `USGS/SRTMGL1_003`                                 | Terrain features                                     |

---

## 8. Ecological Sampling Design

### 8.1 Regional scripts

The sampling pipeline includes the following ecological regions.

| Script                   | Region               | Ecosystem             |
| ------------------------ | -------------------- | --------------------- |
| `00_southern_forests.js` | Indus Delta + Ziarat | Mangroves + juniper   |
| `01_himalayan.js`        | Northern highlands   | High-altitude conifer |
| `02_temperate.js`        | Dir / Swat zone      | Mixed temperate       |
| `03_subtropical_pine.js` | Murree / Margalla    | Subtropical pine      |
| `04_riverine.js`         | Indus corridor       | Riverine / riparian   |
| `05_kaghan.js`           | Kaghan Valley        | Sub-alpine / montane  |
| `06_non_forest.js`       | National             | Non-forest background |

### 8.2 Why ecological sampling was necessary

**Rationale:**
National random sampling in strongly imbalanced landscapes systematically underrepresents ecologically rare but important classes. Region-stratified sampling is a standard corrective strategy when the target variable is spatially clustered and highly imbalanced [Roberts et al., 2017].

### 8.3 Southern forests as a dedicated region

A dedicated southern script was required because:

* mangroves are spectrally sparse and coastal
* juniper woodlands are low-density and open canopy
* strict Hansen-based thresholds fail in sparse dry forests

**Rationale:**
Rare ecosystems often require targeted sampling windows or region-specific thresholds because global products can underdetect sparse or atypical forest structures [Roberts et al., 2017].

---

## 9. Preprocessing Pipeline

The preprocessing differs slightly between canopy cover and canopy height because they use different training imagery.

---

### 9.1 Canopy Cover Preprocessing

#### Input imagery

* Landsat 5 + Landsat 7 Collection 2 Level 2
* Date window: **1998–2004**
* Seasonal filter: **April–October**

#### Cloud masking

Clouds are masked using the Landsat `QA_PIXEL` band.

#### Reflectance scaling

Surface reflectance bands are scaled as:

```text
scaled = raw * 0.0000275 + (-0.2)
```

#### Median compositing

A median composite is created over the selected seasonal window.

**Rationale:**
Median compositing reduces residual cloud contamination and suppresses transient outliers while preserving stable seasonal surface response [Gorelick et al., 2017].

---

### 9.2 Canopy Height Preprocessing

#### Input imagery

* Sentinel-2 SR Harmonized
* Date window: **2019–2021**
* Seasonal filter: **April–October**

#### Cloud masking

Clouds are masked using Sentinel-2 `QA60` bits:

* bit 10: opaque cloud
* bit 11: cirrus

#### Reflectance scaling

Surface reflectance bands are scaled as:

```text
scaled = raw * 0.0001
```

#### Median compositing

A median seasonal composite is produced.

**Rationale:**
The height model uses Sentinel-2 because canopy height inference benefits from finer spatial detail, especially in mountainous and fragmented forest systems [Belgiu & Drăguţ, 2016].

---

### 9.3 National Prediction Composite

For national prediction, a complete **April–October 2025** Sentinel-2 composite is used for both products.

Why 2025:

* a complete growing season is available
* 2026 seasonal coverage may be incomplete
* it ensures seasonal consistency across products

**Rationale:**
Seasonally consistent inference reduces confounding from phenology and improves comparability between products generated from the same annual vegetation cycle [Belgiu & Drăguţ, 2016].

---

## 10. Feature Engineering

Both models use the same 11-feature predictor stack.

### 10.1 Spectral bands

* Blue
* Green
* Red
* NIR
* SWIR1
* SWIR2

### 10.2 Vegetation indices

#### NDVI

```text
NDVI = (NIR - Red) / (NIR + Red)
```

#### NDMI

```text
NDMI = (NIR - SWIR1) / (NIR + SWIR1)
```

**Rationale:**
NDVI is a widely used proxy for vegetation vigor and canopy density, while NDMI provides complementary sensitivity to vegetation water content and canopy moisture [Tucker, 1979; Gao, 1996].

### 10.3 Terrain features

* Elevation
* Slope
* Aspect

Derived from SRTM DEM.

**Rationale:**
In Pakistan, forest distribution and canopy structure are tightly constrained by altitude, slope, and ecological zone, making terrain features especially informative for both cover and height prediction [Belgiu & Drăguţ, 2016].

---

## 11. Training Data Assembly

Regional sampling scripts export CSVs to Google Drive, which are then merged locally.

### 11.1 Canopy cover regional CSVs

* `canopy_cover_00_southern_forests.csv`
* `canopy_cover_01_himalayan.csv`
* `canopy_cover_02_temperate.csv`
* `canopy_cover_03_subtropical_pine.csv`
* `canopy_cover_04_riverine.csv`
* `canopy_cover_05_kaghan.csv`
* `canopy_cover_06_non_forest.csv`

### 11.2 Canopy height regional CSVs

* `canopy_height_00_southern_forests.csv`
* `canopy_height_01_himalayan.csv`
* `canopy_height_02_temperate.csv`
* `canopy_height_03_subtropical_pine.csv`
* `canopy_height_04_riverine.csv`
* `canopy_height_05_kaghan.csv`
* `canopy_height_06_non_forest.csv`

### 11.3 Merge step

The local script `merge_exports.py` concatenates the regional CSVs into:

* `canopy_cover_training.csv`
* `canopy_height_training.csv`

These merged files are uploaded to GEE as table assets for model training.

---

## 12. Model Training in Google Earth Engine

### 12.1 Model family

Both tasks use:

```javascript
ee.Classifier.smileRandomForest(...).setOutputMode('REGRESSION')
```

### 12.2 Model type

* **Canopy cover:** Random Forest regression
* **Canopy height:** Random Forest regression

### 12.3 Hyperparameters

| Hyperparameter          |              Value |
| ----------------------- | -----------------: |
| Number of trees         |                300 |
| Variables per split     | `sqrt(n_features)` |
| Minimum leaf population |                  5 |
| Bag fraction            |                1.0 |
| Seed                    |                 42 |

### 12.4 Training asset paths

* `projects/adk-crash-course-471706/assets/canopy_cover_training`
* `projects/adk-crash-course-471706/assets/canopy_height_training`

---

## 13. Architectural Decisions and Rationale

This section explicitly justifies the core design decisions in the style of a research-focused technical repository.

---

### 13.1 Choice of Random Forest Regression

**Decision:** Use GEE `smileRandomForest` in regression mode for both canopy cover and canopy height.

**Rationale:**
Random Forest is robust to nonlinear relationships, mixed feature types, noisy remote sensing inputs, and moderate label uncertainty. It performs strongly in ecological regression tasks with tabular or pixel-sampled features while requiring less tuning than deep neural methods [Breiman, 2001; Belgiu & Drăguţ, 2016].

**Why not a deep encoder-decoder model?**
The current repository does not contain a dense raster-supervised segmentation training pipeline, PyTorch model code, or GPU training workflow. The available ground-truth setup is most naturally represented as sampled regression targets in GEE rather than dense supervised segmentation masks.

---

### 13.2 GEE-Native Training vs Local Training

**Decision:** Train the models inside Google Earth Engine.

**Rationale:**
This avoids implementation mismatch between local libraries and production inference inside GEE. Since prediction is ultimately performed in Earth Engine, training in the same environment reduces risk of feature-order mismatch, hyperparameter interpretation drift, and deployment inconsistency [Gorelick et al., 2017].

---

### 13.3 Spatial Block Split Instead of Random Pixel Split

**Decision:** Use deterministic 10 km spatial blocks for train / val / test assignment.

**Rationale:**
Pixel-wise random splits in remote sensing can substantially inflate reported accuracy because neighboring pixels are not independent. Spatial blocking is a more defensible strategy for measuring geographic generalization [Roberts et al., 2017].

---

### 13.4 Loss Function

**Decision:** Use the implicit regression loss behavior of Earth Engine’s Random Forest regression setup and evaluate using MAE, RMSE, and R².

**Rationale:**
For continuous biophysical variables, absolute and squared error metrics are standard and interpretable. RMSE penalizes large residuals, while MAE remains robust to heavy-tailed error distributions [Belgiu & Drăguţ, 2016].

> Since GEE `smileRandomForest` does not expose a neural-network style custom loss interface, there is no separately implemented PyTorch loss function in this repository.

---

### 13.5 Optimizer and Scheduler

**Decision:** Not applicable in the final production implementation.

**Rationale:**
The final system uses Random Forest rather than gradient-based neural optimization. Therefore, neural-network training components such as:

* optimizer selection
* learning rate schedule
* warmup
* gradient clipping
* weight decay
* epoch-based training

are not part of the actual implementation in this repository.

---

### 13.6 Data Augmentation

**Decision:** Not applicable in the final production implementation.

**Rationale:**
The final model is not a patch-based deep image segmentation system. Samples are derived from remote sensing composites and feature stacks rather than image chips in a PyTorch dataloader. Standard augmentation operations such as flips, rotations, color jitter, or geometric transforms are therefore not part of the final workflow.

---

### 13.7 Why Cover and Height Use Different Effective Output Resolutions

**Decision:**

* canopy cover is operationally treated as a **30 m** product
* canopy height remains a **10 m** product

**Rationale:**
The canopy cover model is trained on Landsat-derived predictors, so predicting or exporting it at 30 m is more methodologically defensible. The canopy height model is trained on Sentinel-2 at 10 m, so 10 m prediction is consistent with training scale [Belgiu & Drăguţ, 2016].

---

### 13.8 Why a Light Vegetation Mask Is Preferred at Prediction Time

**Decision:** Avoid strict Hansen/LULC forest masks during final prediction; use a light NDVI-based vegetation mask if needed.

**Rationale:**
Strict forest masking removes sparse true forest systems such as mangroves and juniper woodland. A light NDVI mask reduces noise without preventing prediction in ecologically valid sparse vegetation zones [Tucker, 1979; Belgiu & Drăguţ, 2016].

---

## 14. Spatial Validation Strategy

Samples include a deterministic `split` field computed from a **10 km spatial block grid**.

### Split policy

```text
split < 0.70        → Train
0.70 ≤ split < 0.85 → Validation
split ≥ 0.85        → Test
```

### Why this matters

This setup reduces spatial leakage and ensures evaluation measures generalization to unseen geographic blocks, not just unseen pixels.

---

## 15. Results & Evaluation

### 15.1 Primary regression metrics

#### Canopy Cover

| Split      | MAE (%) | RMSE (%) |    R² |
| ---------- | ------: | -------: | ----: |
| Train      |    5.54 |     9.06 | 0.938 |
| Validation |    8.95 |    14.35 | 0.844 |
| Test       |    8.44 |    13.68 | 0.858 |

#### Canopy Height

| Split      | MAE (m) | RMSE (m) |    R² |
| ---------- | ------: | -------: | ----: |
| Train      |    1.52 |     2.39 | 0.969 |
| Validation |    2.46 |     3.70 | 0.917 |
| Test       |    2.43 |     3.71 | 0.926 |

### 15.2 Requested evaluation table including segmentation-style metrics

The final repository does **not** implement a semantic segmentation model, so mIoU and pixel accuracy are **not applicable** to the final production pipeline.

| Task                       | mIoU | Pixel Accuracy |  RMSE |
| -------------------------- | ---: | -------------: | ----: |
| Canopy Cover (regression)  |  N/A |            N/A | 13.68 |
| Canopy Height (regression) |  N/A |            N/A |  3.71 |

### 15.3 Interpretation

* Canopy height is the stronger of the two models.
* Canopy cover generalizes well in dense and moderate forest systems.
* Sparse southern forests remain the most difficult regime.

---

## 16. Error Analysis and Regional Variance

### 16.1 Northern forests

Performance is strongest in:

* upper KP
* Himalayan and conifer regions
* temperate and subtropical zones

These ecosystems have:

* stronger canopy signal
* clearer spectral separation from background
* more stable structure-label relationships

### 16.2 Riverine zones

Riverine regions are moderately represented and typically produce plausible intermediate outputs.

### 16.3 Southern sparse forests

Southern sparse forests remain the weakest region in the canopy cover model.

> **Note on Regional Variance:**
> In the southern regions of Pakistan, sparse forest cover is currently underpredicted. This is attributed to **high soil reflectance interference and spectral similarity between low-density arid vegetation and surrounding background soil**, which limits the model’s ability to distinguish sparse canopy from scrubland and exposed ground.

This effect is particularly evident in:

* Indus Delta mangroves
* Ziarat juniper woodland

### 16.4 Why this happens

The main reasons are:

1. **label limitations**

   * Hansen `treecover2000` underrepresents sparse southern forest systems

2. **background dominance**

   * most pixels in southern ROIs are mostly soil, bare substrate, or sparse vegetation

3. **spectral ambiguity**

   * low-density canopy in dry environments can resemble scrub and arid vegetation

4. **national-model bias**

   * the model is influenced strongly by the dominant structure of non-southern ecosystems

---

## 17. National Prediction Workflow

### 17.1 Canopy cover prediction

Script:

* `canopy_cover/gee_scripts/canopy_cover_pakistan_2025_growing_season.js`

Input:

* Sentinel-2 Apr–Oct 2025 composite
* terrain features
* trained RF model

Output:

* canopy cover raster exported to GEE asset

### 17.2 Canopy height prediction

Script:

* `canopy_height/gee_scripts/canopy_height_pakistan_2025_growing_season.js`

Input:

* Sentinel-2 Apr–Oct 2025 composite
* terrain features
* trained RF model

Output:

* canopy height raster exported to GEE asset

---

## 18. Final Outputs

Final national prediction rasters are stored under:

```text
projects/adk-crash-course-471706/assets/outputs/
```

### Example output assets

* `canopy_cover_2025_growing_season`
* `canopy_height_2025_growing_season`

### Pyramiding policy

For continuous raster outputs, the pyramiding policy is:

```text
mean
```

**Rationale:**
Continuous ecological variables should use average aggregation for pyramid construction rather than categorical aggregation rules [Gorelick et al., 2017].

---

## 19. Reproducibility Guide

### Step 1 — Run the regional sampling scripts in GEE

For each target:

* canopy cover
* canopy height

run the sampling scripts in:

```text
canopy_cover/gee_scripts/sampling/
canopy_height/gee_scripts/sampling/
```

### Step 2 — Download CSV exports

Save the regional CSVs into:

```text
canopy_cover/data/raw_exports/
canopy_height/data/raw_exports/
```

### Step 3 — Merge exports locally

```bash
python canopy_cover/merge_exports.py
python canopy_height/merge_exports.py
```

### Step 4 — Upload merged CSVs to GEE as table assets

Create:

* `canopy_cover_training`
* `canopy_height_training`

### Step 5 — Train models in GEE

Run:

* `canopy_cover_train.js`
* `canopy_height_train.js`

### Step 6 — Export trained models as assets

Suggested asset locations:

* `assets/models/rf_canopy_cover`
* `assets/models/rf_canopy_height`

### Step 7 — Run national prediction scripts

Run:

* `canopy_cover_pakistan_2025_growing_season.js`
* `canopy_height_pakistan_2025_growing_season.js`

### Step 8 — Validate the outputs

Visually compare:

* prediction
* NDVI
* raw Sentinel-2 RGB
* known ecological regions

---

## 20. Limitations

1. **Canopy cover label dependence**
   Hansen `treecover2000` is not ideal for sparse southern forests.

2. **Temporal non-equivalence between products**
   Cover and height are anchored to different label years.

3. **Cross-sensor transfer for canopy cover**
   Cover training uses Landsat labels/features but final inference uses Sentinel-2-based predictors.

4. **No field plot validation**
   Current validation is remote-sensing based, not field inventory based.

5. **Sparse forest underprediction**
   Southern mangroves and juniper remain underrepresented in predicted canopy cover.

6. **No deep learning implementation in final pipeline**
   The current production system is not a PyTorch segmentation framework.

---

## 21. Future Work

### 21.1 Southern-specific canopy cover modeling

A separate sparse-forest model could improve:

* mangrove detection
* juniper woodland cover estimation
* scrub woodland distinction

### 21.2 Additional predictors

Potential improvements:

* Sentinel-1 radar
* seasonal composites
* texture features
* sin/cos encoding of aspect

### 21.3 Independent validation

Use:

* field plots
* LiDAR
* high-resolution manual interpretation
* regional forestry inventory data

### 21.4 Uncertainty estimation

Possible additions:

* ensemble variance
* quantile RF
* uncertainty rasters

### 21.5 Region-aware modeling

A hierarchical or ecozone-conditioned model may reduce bias from dominant northern forest systems.

---

## 22. References

All inline citations in this README correspond to the following published works.

| Short citation | Purpose in this document |
| --- | --- |
| `[Breiman, 2001]` | Foundational Random Forest method |
| `[Belgiu & Drăguţ, 2016]` | RF applications in remote sensing |
| `[Roberts et al., 2017]` | Spatial blocking and cross-validation |
| `[Tucker, 1979]` | NDVI as a vegetation index |
| `[Gao, 1996]` | NDWI / NDMI for vegetation water content |
| `[Gorelick et al., 2017]` | Google Earth Engine platform |

Full bibliographic details are in [Section 23](#23-bibliography).

---

## Final Summary

This repository implements a **practical, research-oriented, GEE-native forest structure mapping system for Pakistan**. The project’s main strengths are:

* ecologically stratified regional sampling
* spatially aware evaluation
* unified cloud-based training and prediction
* national-scale output generation
* explicit treatment of rare southern ecosystems

The final system is best understood as:

* a **regression-based geospatial ML pipeline**
* optimized for **national forest structure estimation**
* strongest in **dense and moderate forest systems**
* more uncertain in **sparse southern dry forests**

For a semester-long capstone, this project demonstrates a meaningful combination of:

* remote sensing
* geospatial AI
* machine learning evaluation
* ecological reasoning
* operational Earth Engine deployment

---

## 23. Bibliography

Belgiu, M., & Drăguţ, L. (2016). Random forest in remote sensing: A review of applications and future directions. *ISPRS Journal of Photogrammetry and Remote Sensing*, 114, 24–31.

Breiman, L. (2001). Random Forests. *Machine Learning*, 45, 5–32.

Gao, B.-C. (1996). NDWI—A normalized difference water index for remote sensing of vegetation liquid water from space. *Remote Sensing of Environment*, 58(3), 257–266.

Gorelick, N., Hancher, M., Dixon, M., Ilyushchenko, S., Thau, D., & Moore, R. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment*, 202, 18–27.

Roberts, D. R., Bahn, V., Ciuti, S., et al. (2017). Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure. *Ecography*, 40(8), 913–929.

Tucker, C. J. (1979). Red and photographic infrared linear combinations for monitoring vegetation. *Remote Sensing of Environment*, 8, 127–150.
