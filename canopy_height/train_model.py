"""
Canopy Height Model Training
==============================
Trains a Random Forest regression model to predict ETH canopy height 2020 (0-55 m)
from Sentinel-2 reflectance + terrain predictors.

Usage:
    python canopy_height/train_model.py

Output:
    canopy_height/models/canopy_height_rf.joblib      -- trained model
    canopy_height/models/canopy_height_rf_metrics.json -- evaluation metrics
"""

import io
import json
import logging
import os
import sys
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(__file__)
LOG_DIR  = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_stdout_utf8 = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
_stream_handler = logging.StreamHandler(_stdout_utf8)
_stream_handler.setFormatter(
    logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        _stream_handler,
        logging.FileHandler(os.path.join(LOG_DIR, "train_model.log"), mode="w", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_CSV     = os.path.join(BASE_DIR, "data", "canopy_height_training.csv")
MODEL_DIR    = os.path.join(BASE_DIR, "models")
MODEL_PATH   = os.path.join(MODEL_DIR, "canopy_height_rf.joblib")
METRICS_PATH = os.path.join(MODEL_DIR, "canopy_height_rf_metrics.json")

os.makedirs(MODEL_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Feature columns
# ---------------------------------------------------------------------------
FEATURES = [
    "Blue", "Green", "Red", "NIR", "SWIR1", "SWIR2",
    "NDVI", "NDMI",
    "Elevation", "Slope", "Aspect",
]
TARGET = "canopy_height"

# ---------------------------------------------------------------------------
# Hyperparameters
# ---------------------------------------------------------------------------
RF_PARAMS = {
    "n_estimators": 300,
    "max_features": "sqrt",
    "min_samples_leaf": 5,
    "n_jobs": -1,
    "random_state": 42,
    "oob_score": True,
}

# Split thresholds (based on the 'split' random column 0-1)
VAL_THRESHOLD  = 0.70   # split < 0.70  -> train
TEST_THRESHOLD = 0.85   # 0.70 <= split < 0.85 -> val,  >= 0.85 -> test


def load_and_split(csv_path: str):
    log.info("Loading dataset: %s", csv_path)
    df = pd.read_csv(csv_path)
    log.info("  Total rows: %d", len(df))
    log.info("  Columns: %s", list(df.columns))

    for grp, cnt in df.groupby(["region", "sampling_group"]).size().items():
        log.info("  %-22s %s : %d rows", grp[0], grp[1], cnt)

    missing = [c for c in FEATURES + [TARGET, "split"] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in CSV: {missing}")

    before = len(df)
    df = df.dropna(subset=FEATURES + [TARGET])
    dropped = before - len(df)
    if dropped:
        log.warning("Dropped %d rows with null values in features/target", dropped)

    train_df = df[df["split"] < VAL_THRESHOLD]
    val_df   = df[(df["split"] >= VAL_THRESHOLD) & (df["split"] < TEST_THRESHOLD)]
    test_df  = df[df["split"] >= TEST_THRESHOLD]

    log.info(
        "Split -- train: %d  val: %d  test: %d",
        len(train_df), len(val_df), len(test_df),
    )

    return (
        train_df[FEATURES].values, train_df[TARGET].values,
        val_df[FEATURES].values,   val_df[TARGET].values,
        test_df[FEATURES].values,  test_df[TARGET].values,
    )


def evaluate(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2   = r2_score(y_true, y_pred)
    log.info("%-10s  MAE=%.2f  RMSE=%.2f  R2=%.4f", name, mae, rmse, r2)
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(r2, 4)}


def train():
    log.info("=" * 60)
    log.info("Canopy Height Model Training")
    log.info("=" * 60)

    X_train, y_train, X_val, y_val, X_test, y_test = load_and_split(DATA_CSV)

    log.info("Training Random Forest  params=%s", RF_PARAMS)
    rf = RandomForestRegressor(**RF_PARAMS)
    rf.fit(X_train, y_train)
    log.info("  OOB R2 (train set): %.4f", rf.oob_score_)

    log.info("--- Evaluation ---")
    metrics = {
        "train":  evaluate("train", y_train, rf.predict(X_train)),
        "val":    evaluate("val",   y_val,   rf.predict(X_val)),
        "test":   evaluate("test",  y_test,  rf.predict(X_test)),
        "oob_r2": round(rf.oob_score_, 4),
    }

    log.info("--- Feature importances (MDI) ---")
    importances = dict(zip(FEATURES, rf.feature_importances_))
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        log.info("  %-12s %.4f", feat, imp)
    metrics["feature_importances"] = {k: round(v, 6) for k, v in importances.items()}

    log.info("--- Permutation importances (val set, 5 repeats) ---")
    perm = permutation_importance(
        rf, X_val, y_val, n_repeats=5, random_state=42, n_jobs=-1
    )
    perm_means = dict(zip(FEATURES, perm.importances_mean))
    for feat, imp in sorted(perm_means.items(), key=lambda x: -x[1]):
        log.info("  %-12s %.4f", feat, imp)
    metrics["permutation_importances"] = {
        k: round(float(v), 6) for k, v in perm_means.items()
    }

    joblib.dump(rf, MODEL_PATH)
    log.info("Model saved -> %s", MODEL_PATH)

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    log.info("Metrics saved -> %s", METRICS_PATH)

    log.info("=" * 60)
    log.info("Done.")
    log.info("=" * 60)


if __name__ == "__main__":
    train()
