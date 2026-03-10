**Title:**
Workflow for Predicting Canopy Cover and Canopy Height for Pakistan Using Satellite Imagery and Machine Learning

---

# 1. Objective

The goal of this project is to generate **wall-to-wall canopy cover and canopy height maps for Pakistan** using satellite imagery and machine learning.

Two regression models will be trained:

1. **Canopy Cover Model**
   Predicts tree canopy cover percentage.

2. **Canopy Height Model**
   Predicts canopy height in meters.

These models will learn relationships between **satellite imagery and forest structure variables**, then be applied to imagery covering the entire country.

---

# 2. Data Sources

## 2.1 Pakistan LULC Dataset

Dataset location:

```
projects/adk-crash-course-471706/assets/lulc2020
```

Resolution:

```
30 m
```

Forest class:

```
Value = 1
```

Purpose:

Provides **conservative forest extent** for Pakistan.

This dataset was produced using **Random Forest classification of Landsat imagery**.

---

## 2.2 Hansen Global Forest Change Dataset

Dataset:

```
UMD/hansen/global_forest_change_2024_v1_12
```

Key band used:

```
treecover2000
```

Meaning:

```
Percent canopy cover in year 2000
```

Range:

```
0 – 100 %
```

---

## 2.3 ETH Global Canopy Height Dataset

Dataset:

```
users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1
```

Resolution:

```
10 m
```

Meaning:

```
Height of vegetation canopy in meters
```

Year:

```
2020
```

---

## 2.4 Satellite Imagery for Predictors

Primary imagery:

```
Sentinel-2 Surface Reflectance
```

Dataset:

```
COPERNICUS/S2_SR
```

Reason:

* 10 m spatial resolution
* strong vegetation signal
* suitable for canopy structure modeling

---

# 3. Creation of the Final Forest Mask

The final forest mask defines the **core forest training regions**.

Two datasets are combined:

1. Pakistan LULC forest class
2. Hansen tree canopy cover

## 3.1 LULC Forest Mask

Forest pixels are extracted:

```
lulcForest = lulc == 1
```

This represents **known forest land cover** in Pakistan.

---

## 3.2 Hansen Forest Mask

Tree cover threshold:

```
treecover ≥ 25 %
```

Loss removal:

```
lossyear == 0
```

Meaning:

Only areas that have **not experienced forest loss since 2000** are kept.

---

## 3.3 Union of Both Datasets

The final forest mask is created using a **union operation**.

```
FinalForest = LULC Forest OR Hansen Forest
```

Reason:

Pakistan forests are often:

* fragmented
* low density
* located on steep terrain

Global datasets often miss these forest types.

Using a union ensures that forests detected by **either dataset are preserved**.

---

# 4. Predictor Stack (Model Inputs)

The model uses a **multi-layer predictor stack** derived from satellite imagery and terrain.

All layers are combined into a single multi-band image.

---

## 4.1 Sentinel-2 Spectral Bands

| Band | Description          |
| ---- | -------------------- |
| B2   | Blue                 |
| B3   | Green                |
| B4   | Red                  |
| B8   | Near Infrared        |
| B11  | Shortwave Infrared 1 |
| B12  | Shortwave Infrared 2 |

These bands capture:

* vegetation reflectance
* moisture content
* canopy density

---

## 4.2 Vegetation Indices

### NDVI

```
NDVI = (NIR − Red) / (NIR + Red)
```

Purpose:

Indicates vegetation density.

---

### NDMI

```
NDMI = (NIR − SWIR) / (NIR + SWIR)
```

Purpose:

Sensitive to vegetation water content.

---

## 4.3 Terrain Variables

Terrain strongly influences forest structure.

Derived from SRTM DEM.

Dataset:

```
USGS/SRTMGL1_003
```

Variables used:

| Variable  | Description            |
| --------- | ---------------------- |
| Elevation | meters above sea level |
| Slope     | terrain steepness      |
| Aspect    | slope orientation      |

---

## 4.4 Final Predictor Stack

```
Blue
Green
Red
NIR
SWIR1
SWIR2
NDVI
NDMI
Elevation
Slope
Aspect
```

These predictors form the **input feature space (X)**.

## 4.5 Temporal Alignment of Training Data

The canopy cover and canopy height models must be trained using **satellite imagery from the same time period as their labels**.

This is necessary to avoid **temporal mismatch**, which occurs when the input imagery and reference labels represent different forest conditions.

---

### Canopy Cover Model

Reference label:

```
Hansen treecover2000
```

Year represented:

```
2000
```

Therefore, the predictor imagery used for training must correspond to approximately the same time period.

Recommended imagery:

```
Landsat 5 / Landsat 7
1999–2002
```

Training configuration:

```
Input (X): Landsat imagery + terrain variables
Label (Y): Hansen treecover2000
```

Model learns:

```
Landsat reflectance → canopy cover
```

---

### Canopy Height Model

Reference label:

```
ETH Global Canopy Height 2020
```

Year represented:

```
2020
```

Predictor imagery must therefore correspond to the same period.

Recommended imagery:

```
Sentinel-2 Surface Reflectance
2019–2021
```

Training configuration:

```
Input (X): Sentinel-2 imagery + terrain variables
Label (Y): ETH canopy height
```

Model learns:

```
Sentinel-2 reflectance → canopy height
```

---

### Reason This Is Necessary

If imagery and labels represent different years, the model will learn incorrect relationships.

Example:

```
Satellite image: 2020
Label: canopy cover 2000
```

In areas where forests changed between 2000 and 2020, the model will receive contradictory information.

Example scenario:

```
2000 → forest present
2020 → forest cleared
```

The model would see:

```
satellite image of barren land → canopy cover = 60%
```

This produces incorrect training signals and degrades model performance.

---

### Prediction Phase (2025)

After training, the models can be applied to **new imagery**.

Prediction inputs:

```
Sentinel-2 imagery 2025
Predictor stack generation
```

Model outputs:

```
Predicted canopy cover 2025
Predicted canopy height 2025
```

Because the model has learned the relationship between **spectral signals and forest structure**, it can generalize to later years.

---

### Final Training Setup

| Model         | Input Imagery | Label             | Label Year |
| ------------- | ------------- | ----------------- | ---------- |
| Canopy Cover  | Landsat 5/7   | Hansen treecover  | 2000       |
| Canopy Height | Sentinel-2    | ETH canopy height | 2020       |

---

# 5. Label Data (Model Targets)

Two labels are used.

---

## 5.1 Canopy Cover Label

Source:

```
Hansen treecover2000
```

Range:

```
0 – 100 %
```

Interpretation:

| Value | Meaning              |
| ----- | -------------------- |
| 0     | No trees             |
| 10    | Sparse vegetation    |
| 30    | Open forest          |
| 60    | Dense forest         |
| 80+   | Closed canopy forest |

---

## 5.2 Canopy Height Label

Source:

```
ETH canopy height 2020
```

Range:

```
0 – ~40 meters
```

Interpretation:

| Height  | Meaning       |
| ------- | ------------- |
| 0 m     | bare land     |
| 1-3 m   | shrubs        |
| 5-10 m  | young forest  |
| 15-40 m | mature forest |

---

# 6. Training Data Generation

Training data is created by **sampling pixels** from predictor and label layers.

Each pixel becomes a row in the training dataset.

Example structure:

| B2    | B3    | B4    | ...  | Elevation | Canopy Cover |
| ----- | ----- | ----- | ----- | --------- | ------------ |
| value | value | value | ... | value     | target       |

---

# 7. Best Sampling Strategy for Pakistan Forests

Random sampling across Pakistan often leads to **extreme dataset imbalance** because large parts of Pakistan are:

* desert
* barren land
* cropland

This results in very few forest samples.

A **stratified ecological sampling approach** is recommended.

---

## 7.1 Sampling Regions

Samples should be drawn from multiple forest ecosystems.

Recommended regions:

### Himalayan Forests

Examples:

```
Gilgit
Hunza
Skardu
Chitral
```

Characteristics:

* high altitude
* dense conifer forests

---

### Temperate Forests

Examples:

```
Swat
Dir
Kalam
```

Characteristics:

* mixed forests
* moderate canopy density

---

### Subtropical Pine Forests

Examples:

```
Murree
Abbottabad
Margalla Hills
```

Characteristics:

* pine dominated
* moderate height

---

### Riverine Forests

Examples:

```
Indus floodplain
Sindh riverine forests
```

Characteristics:

* dense vegetation
* flat terrain

---

### Dry Forests

Examples:

```
Balochistan mountains
```

Characteristics:

* sparse woodland
* low canopy cover

---

## 7.2 Sampling Distribution

Recommended dataset size:

```
20,000 – 50,000 samples
```

Suggested distribution:

| Class           | Percentage |
| --------------- | ---------- |
| Dense forest    | 25%        |
| Moderate forest | 25%        |
| Sparse forest   | 25%        |
| Non-forest      | 25%        |

This ensures balanced training.

---

# 8. Dataset Splitting

Training data should be split into:

```
70 % Training
15 % Validation
15 % Testing
```

Purpose:

| Set        | Purpose               |
| ---------- | --------------------- |
| Training   | model learning        |
| Validation | hyperparameter tuning |
| Testing    | final evaluation      |

---

# 9. Model Training

Two independent models will be trained.

---

## 9.1 Canopy Cover Model

Model learns:

```
Satellite predictors → canopy cover
```

Recommended algorithms:

```
Random Forest
XGBoost
LightGBM
```

Random Forest is recommended for the first implementation because it handles nonlinear relationships well.

---

## 9.2 Canopy Height Model

Model learns:

```
Satellite predictors → canopy height
```

The same predictor stack can be used.

---

# 10. Model Prediction

After training, the models are applied to satellite imagery covering **all of Pakistan**.

Prediction pipeline:

```
Satellite imagery Pakistan
        ↓
Predictor stack generation
        ↓
Model inference
        ↓
Canopy cover map
Canopy height map
```

Outputs:

```
Pakistan Canopy Cover Map
Pakistan Canopy Height Map
```

Resolution:

```
10–30 m
```

---

# 11. Final Outputs

The project produces two national forest structure layers.

| Layer         | Description             |
| ------------- | ----------------------- |
| Canopy Cover  | percentage tree cover   |
| Canopy Height | forest height in meters |

These layers can be used for:

* forest monitoring
* biomass estimation
* wildfire modeling
* carbon accounting
* ecological analysis

---

# 12. Summary Workflow

```
Load datasets
      ↓
Create Final Forest Mask
      ↓
Build Predictor Stack
      ↓
Prepare Labels
      ↓
Generate Training Samples
      ↓
Split Dataset
      ↓
Train Cover Model
      ↓
Train Height Model
      ↓
Apply Models to Pakistan
      ↓
Generate Forest Structure Maps
```

---

If needed, the next document can describe **the full Python + Earth Engine pipeline** so Copilot can automatically generate the scripts for:

* training dataset export
* model training
* inference over Pakistan.
