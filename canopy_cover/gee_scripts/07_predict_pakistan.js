// =============================================================
// CANOPY COVER — Wall-to-wall Pakistan Prediction
// =============================================================
//
// BEFORE RUNNING:
//   1. Upload canopy_cover_training.csv as a GEE Table asset:
//      GEE Code Editor > Assets tab > New > CSV file upload
//      Name it: canopy_cover_training
//      Full path will be: projects/<your-project>/assets/canopy_cover_training
//   2. Update TRAINING_ASSET below to match your asset path.
//
// OUTPUT:
//   pakistan_canopy_cover_30m.tif — GeoTIFF in gee_exports/ on Google Drive
//   Values: 0–100 (predicted % canopy cover)
//   Resolution: 30 m
// =============================================================

// ── UPDATE THIS ───────────────────────────────────────────────
var TRAINING_ASSET = 'projects/adk-crash-course-471706/assets/canopy_cover_training';
// ─────────────────────────────────────────────────────────────

var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var FEATURES = ['Blue','Green','Red','NIR','SWIR1','SWIR2',
                'NDVI','NDMI','Elevation','Slope','Aspect'];
var SCALE    = 30;

var lulc   = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var srtm   = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

// ── Predictor stack (identical to training scripts) ───────────
function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1<<3).neq(0)
    .or(qa.bitwiseAnd(1<<4).neq(0))
    .or(qa.bitwiseAnd(1<<2).neq(0)).not();
  return image.updateMask(clear);
}
function applyScale(image) {
  return image.addBands(image.select(BAND_IN).multiply(0.0000275).add(-0.2), null, true);
}
function buildLandsat(id) {
  return ee.ImageCollection(id)
    .filterDate('1998-01-01', '2004-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))
    .filterBounds(pakistan)
    .map(maskClouds).map(applyScale).select(BAND_IN, BAND_OUT);
}

var landsat = buildLandsat('LANDSAT/LT05/C02/T1_L2')
  .merge(buildLandsat('LANDSAT/LE07/C02/T1_L2')).median().clip(pakistan);

var predictors = landsat
  .addBands(landsat.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(landsat.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));

// ── Load training data + train GEE Random Forest ──────────────
var trainingFC = ee.FeatureCollection(TRAINING_ASSET);

// smileRandomForest parameters mirror the scikit-learn model:
//   n_estimators=300, max_features='sqrt', min_samples_leaf=5
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees:    300,
  variablesPerSplit: null,   // null = sqrt(nFeatures), same as sklearn default
  minLeafPopulation: 5,
  bagFraction:       0.5,
  seed:              42
}).setOutputMode('REGRESSION')
  .train({
    features:        trainingFC,
    classProperty:   'canopy_cover',
    inputProperties: FEATURES
  });

// ── Apply classifier to full Pakistan ────────────────────────
var prediction = predictors.select(FEATURES)
  .classify(classifier)
  .rename('canopy_cover')
  // Clamp to valid range (RF can very occasionally extrapolate slightly outside)
  .clamp(0, 100)
  .clip(pakistan);

// ── Visualise (optional) ──────────────────────────────────────
Map.centerObject(pakistan, 6);
Map.addLayer(prediction, {min: 0, max: 80, palette: ['#ffffcc','#78c679','#238443','#005a32']},
             'Canopy Cover (%)');

print('Prediction image:', prediction);

// ── Export ────────────────────────────────────────────────────
Export.image.toDrive({
  image:          prediction,
  description:    'pakistan_canopy_cover_30m',
  folder:         'gee_exports',
  fileNamePrefix: 'pakistan_canopy_cover_30m',
  region:         pakistan,
  scale:          SCALE,
  crs:            'EPSG:4326',
  maxPixels:      1e11,
  fileFormat:     'GeoTIFF'
});
// Click "Run", then go to Tasks tab and click "Run" next to the export task.
// The export takes ~10-30 minutes depending on GEE queue.
