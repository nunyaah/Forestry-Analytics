// =============================================================
// CANOPY COVER — GEE-Native Model Training & Evaluation
// =============================================================
// ⚠ TEMPORAL NOTE: This cover model uses Landsat ~2000 imagery for
// a year-2000 label (Hansen treecover2000). The companion height
// model uses Sentinel-2 ~2020 for a year-2020 label. Do NOT overlay
// these outputs for direct change detection.
// =============================================================
//
// This script replaces the local scikit-learn train_model.py to
// eliminate "model drift" between sklearn and GEE smileRandomForest.
// The model trained here is the SAME implementation that will be
// used for wall-to-wall prediction.
//
// BEFORE RUNNING:
//   1. Run scripts 00–06 and download CSVs from Google Drive.
//   2. Run merge_exports.py to create canopy_cover_training.csv.
//   3. Upload it as a GEE Table asset.
//   4. Update TRAINING_ASSET below.
//
// OUTPUT: Metrics printed to Console (MAE, RMSE, R² per split).
// =============================================================

// ── UPDATE THIS ───────────────────────────────────────────────
var TRAINING_ASSET = 'projects/adk-crash-course-471706/assets/training/canopy_cover_training';
// ─────────────────────────────────────────────────────────────

var FEATURES = ['Blue','Green','Red','NIR','SWIR1','SWIR2',
                'NDVI','NDMI','Elevation','Slope','Aspect'];
var TARGET   = 'canopy_cover';

// ═══════════════════════════════════════════════════════════════
// 1. LOAD & SPLIT (spatial blocks, pre-computed in sampling scripts)
//    split < 0.70 → Train | 0.70–0.85 → Val | ≥ 0.85 → Test
// ═══════════════════════════════════════════════════════════════

var allData = ee.FeatureCollection(TRAINING_ASSET);

var trainFC = allData.filter(ee.Filter.lt('split', 0.70));
var valFC   = allData.filter(ee.Filter.and(
                ee.Filter.gte('split', 0.70),
                ee.Filter.lt('split', 0.85)));
var testFC  = allData.filter(ee.Filter.gte('split', 0.85));

print('──── Dataset sizes ────');
print('Train:', trainFC.size());
print('Val:  ', valFC.size());
print('Test: ', testFC.size());

// ═══════════════════════════════════════════════════════════════
// 2. TRAIN smileRandomForest
// ═══════════════════════════════════════════════════════════════
// bagFraction: 1.0 matches standard RF bootstrap behaviour
// (the old 07_predict scripts used 0.5 which diverged from sklearn).

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees:     300,
  variablesPerSplit: null,   // null → sqrt(nFeatures)
  minLeafPopulation: 5,
  bagFraction:       1.0,
  seed:              42
}).setOutputMode('REGRESSION')
  .train({
    features:        trainFC,
    classProperty:   TARGET,
    inputProperties: FEATURES
  });

// ═══════════════════════════════════════════════════════════════
// 3. EVALUATE — RMSE, MAE, R² on each split
// ═══════════════════════════════════════════════════════════════

function evaluateSet(fc, setName) {
  var classified = fc.classify(classifier);
  var meanLabel  = fc.aggregate_mean(TARGET);

  var withErrors = classified.map(function(f) {
    var actual = ee.Number(f.get(TARGET));
    var pred   = ee.Number(f.get('classification'));
    var err    = pred.subtract(actual);
    return f.set({
      abs_error: err.abs(),
      sq_error:  err.multiply(err),
      sq_total:  actual.subtract(meanLabel).pow(2)
    });
  });

  var mae   = withErrors.aggregate_mean('abs_error');
  var mse   = withErrors.aggregate_mean('sq_error');
  var rmse  = ee.Number(mse).sqrt();
  var ssRes = withErrors.aggregate_sum('sq_error');
  var ssTot = withErrors.aggregate_sum('sq_total');
  var r2    = ee.Number(1).subtract(ee.Number(ssRes).divide(ssTot));

  print('── ' + setName + ' ──');
  print('  N    :', withErrors.size());
  print('  MAE  :', mae);
  print('  RMSE :', rmse);
  print('  R²   :', r2);
}

print('');
print('═══════════════════════════════════════');
print('  CANOPY COVER — SPATIAL BLOCK METRICS');
print('═══════════════════════════════════════');
evaluateSet(trainFC, 'Train');
evaluateSet(valFC,   'Validation');
evaluateSet(testFC,  'Test (spatial blocks)');

// ═══════════════════════════════════════════════════════════════
// 4. PREDICTION PREVIEW (map visualisation only — no export)
//    No Hansen/LULC mask so sparse forests are preserved.
//    Optional light vegetation mask using NDVI.
// ═══════════════════════════════════════════════════════════════

var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var srtm = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1<<3).neq(0)
    .or(qa.bitwiseAnd(1<<4).neq(0))
    .or(qa.bitwiseAnd(1<<2).neq(0)).not();
  return image.updateMask(clear);
}

function applyScale(image) {
  return image.addBands(
    image.select(BAND_IN).multiply(0.0000275).add(-0.2),
    null,
    true
  );
}

function buildLandsat(id) {
  return ee.ImageCollection(id)
    .filterDate('1998-01-01', '2004-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))
    .filterBounds(pakistan)
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN, BAND_OUT);
}

var landsat = buildLandsat('LANDSAT/LT05/C02/T1_L2')
  .merge(buildLandsat('LANDSAT/LE07/C02/T1_L2'))
  .median()
  .clip(pakistan);

var predictors = landsat
  .addBands(landsat.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(landsat.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));


// Optional vegetation mask (very light)
var vegetationMask = predictors.select('NDVI').gt(0.05);


// Predict canopy cover
var prediction = predictors
  .select(FEATURES)
  .classify(classifier)
  .rename('canopy_cover')
  .clamp(0,100)
  .updateMask(vegetationMask)   // prevents ocean/desert noise
  .clip(pakistan);


// ── Visualisation ─────────────────────────────────────────────
Map.centerObject(pakistan, 6);

Map.addLayer(
  prediction,
  {min:0, max:80, palette:['#ffffcc','#78c679','#238443','#005a32']},
  'Canopy Cover (%)'
);

print('RF explanation:', classifier.explain());
print('Prediction image:', prediction);

Export.classifier.toAsset({
  classifier: classifier,
  description: 'rf_canopy_cover_model',
  assetId: 'projects/adk-crash-course-471706/assets/models/rf_canopy_cover'
});