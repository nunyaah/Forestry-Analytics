// =============================================================
// CANOPY HEIGHT — GEE-Native Model Training & Evaluation
// =============================================================
// ⚠ TEMPORAL NOTE: This height model uses Sentinel-2 ~2020 imagery
// for a year-2020 label (ETH canopy height). The companion cover
// model uses Landsat ~2000 for a year-2000 label. Do NOT overlay
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
//   2. Run merge_exports.py to create canopy_height_training.csv.
//   3. Upload it as a GEE Table asset.
//   4. Update TRAINING_ASSET below.
//
// OUTPUT: Metrics printed to Console (MAE, RMSE, R² per split).
// =============================================================

// ── UPDATE THIS ───────────────────────────────────────────────
var TRAINING_ASSET = 'projects/adk-crash-course-471706/assets/training/canopy_height_training';
// ─────────────────────────────────────────────────────────────

var FEATURES = ['Blue','Green','Red','NIR','SWIR1','SWIR2',
                'NDVI','NDMI','Elevation','Slope','Aspect'];
var TARGET   = 'canopy_height';

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
print('  CANOPY HEIGHT — SPATIAL BLOCK METRICS');
print('═══════════════════════════════════════');
evaluateSet(trainFC, 'Train');
evaluateSet(valFC,   'Validation');
evaluateSet(testFC,  'Test (spatial blocks)');


// ═══════════════════════════════════════════════════════════════
// 4. PREDICTION PREVIEW (map visualisation only — no export)
//    No Hansen/LULC mask so sparse forests are preserved.
//    Optional NDVI vegetation mask only to remove water/desert.
// ═══════════════════════════════════════════════════════════════

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var srtm = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

function maskClouds(image) {
  var qa = image.select('QA60');
  return image.updateMask(
    qa.bitwiseAnd(1 << 10).eq(0)
      .and(qa.bitwiseAnd(1 << 11).eq(0))
  );
}

function applyScale(image) {
  return image.addBands(
    image.select(BAND_IN).multiply(0.0001),
    null,
    true
  );
}

function buildSentinel2() {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate('2019-01-01', '2021-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))
    .filterBounds(pakistan)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN, BAND_OUT);
}

var s2 = buildSentinel2()
  .median()
  .clip(pakistan);

var predictors = s2
  .addBands(s2.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));


// Optional light vegetation mask
var vegetationMask = predictors.select('NDVI').gt(0.05);


// Predict canopy height
var prediction = predictors
  .select(FEATURES)
  .classify(classifier)
  .rename('canopy_height')
  .clamp(0, 50)
  .updateMask(vegetationMask)   // removes water/desert noise only
  .clip(pakistan);


// Visualisation
Map.centerObject(pakistan, 6);

Map.addLayer(
  prediction,
  {min:0, max:40, palette:['#ffffcc','#c2e699','#54be8b','#1a7b42','#004529']},
  'Canopy Height (m)'
);

print('RF explanation:', classifier.explain());
print('Prediction image:', prediction);

Export.classifier.toAsset({
  classifier: classifier,
  description: 'rf_canopy_height_model',
  assetId: 'projects/adk-crash-course-471706/assets/models/rf_canopy_height'
});