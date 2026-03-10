// =============================================================
// CANOPY HEIGHT — Wall-to-wall Pakistan Prediction
// =============================================================
//
// BEFORE RUNNING:
//   1. Upload canopy_height_training.csv as a GEE Table asset:
//      GEE Code Editor > Assets tab > New > CSV file upload
//      Name it: canopy_height_training
//      Full path will be: projects/<your-project>/assets/canopy_height_training
//   2. Update TRAINING_ASSET below to match your asset path.
//
// OUTPUT:
//   pakistan_canopy_height_30m.tif — GeoTIFF in gee_exports/ on Google Drive
//   Values: 0–55 m (predicted canopy height)
//   Resolution: 30 m  (resampled from 10 m for practical export size over Pakistan)
//   To export at 10 m: change EXPORT_SCALE to 10 — file will be ~9× larger (~3 GB)
// =============================================================

// ── UPDATE THIS ───────────────────────────────────────────────
var TRAINING_ASSET = 'projects/adk-crash-course-471706/assets/canopy_height_training';
// ─────────────────────────────────────────────────────────────

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var FEATURES = ['Blue','Green','Red','NIR','SWIR1','SWIR2',
                'NDVI','NDMI','Elevation','Slope','Aspect'];
var EXPORT_SCALE = 30;   // change to 10 for full native resolution (larger file)

var lulc   = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var srtm   = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

// ── Predictor stack (identical to training scripts) ───────────
function maskClouds(image) {
  var qa = image.select('QA60');
  return image.updateMask(
    qa.bitwiseAnd(1 << 10).eq(0)
      .and(qa.bitwiseAnd(1 << 11).eq(0))
  );
}
function applyScale(image) {
  return image.addBands(image.select(BAND_IN).multiply(0.0001), null, true);
}
function buildSentinel2() {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate('2019-01-01', '2021-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))
    .filterBounds(pakistan)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskClouds).map(applyScale).select(BAND_IN, BAND_OUT);
}

var s2 = buildSentinel2().median().clip(pakistan);

var predictors = s2
  .addBands(s2.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));

// ── Load training data + train GEE Random Forest ──────────────
var trainingFC = ee.FeatureCollection(TRAINING_ASSET);

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees:     300,
  variablesPerSplit: null,   // null = sqrt(nFeatures)
  minLeafPopulation: 5,
  bagFraction:       0.5,
  seed:              42
}).setOutputMode('REGRESSION')
  .train({
    features:        trainingFC,
    classProperty:   'canopy_height',
    inputProperties: FEATURES
  });

// ── Apply classifier to full Pakistan ────────────────────────
var prediction = predictors.select(FEATURES)
  .classify(classifier)
  .rename('canopy_height')
  // Clamp to valid ETH label range
  .clamp(0, 55)
  .clip(pakistan);

// ── Visualise (optional) ──────────────────────────────────────
Map.centerObject(pakistan, 6);
Map.addLayer(prediction, {min: 0, max: 40, palette: ['#ffffcc','#c2e699','#54be8b','#1a7b42','#004529']},
             'Canopy Height (m)');

print('Prediction image:', prediction);

// ── Export ────────────────────────────────────────────────────
Export.image.toDrive({
  image:          prediction,
  description:    'pakistan_canopy_height_30m',
  folder:         'gee_exports',
  fileNamePrefix: 'pakistan_canopy_height_30m',
  region:         pakistan,
  scale:          EXPORT_SCALE,
  crs:            'EPSG:4326',
  maxPixels:      1e11,
  fileFormat:     'GeoTIFF'
});
// Click "Run", then go to Tasks tab and click "Run" next to the export task.
// The export takes ~10-30 minutes depending on GEE queue.
