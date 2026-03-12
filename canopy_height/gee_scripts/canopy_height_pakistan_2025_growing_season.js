// =============================================================
// CANOPY HEIGHT PREDICTION — Pakistan
// Sentinel-2 SR Harmonized, 10 m
// =============================================================

// Load trained RF model
var classifier = ee.Classifier.load(
  'projects/adk-crash-course-471706/assets/models/rf_canopy_height'
);

// Predictor list (must match training)
var FEATURES = [
  'Blue','Green','Red','NIR','SWIR1','SWIR2',
  'NDVI','NDMI','Elevation','Slope','Aspect'
];

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

// Use a complete growing season by default.
// Change these once 2026 Apr-Oct is fully available.
var START_DATE = '2025-04-01';
var END_DATE   = '2025-10-31';

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan'))
  .geometry();

var srtm = ee.Image('USGS/SRTMGL1_003');


// -------------------------------------------------------------
// Sentinel-2 preprocessing
// -------------------------------------------------------------
function maskClouds(image) {
  var qa = image.select('QA60');
  var clear = qa.bitwiseAnd(1 << 10).eq(0)
    .and(qa.bitwiseAnd(1 << 11).eq(0));

  return image.updateMask(clear);
}

function prepareImage(image) {
  return image
    .select(BAND_IN)
    .multiply(0.0001)
    .rename(BAND_OUT)
    .copyProperties(image, ['system:time_start']);
}


// -------------------------------------------------------------
// Sentinel-2 composite
// -------------------------------------------------------------
var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(START_DATE, END_DATE)
  .filterBounds(pakistan)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .map(maskClouds)
  .map(prepareImage);

print('Sentinel-2 images:', s2Collection.size());

var s2 = s2Collection.median().clip(pakistan);

print('Composite band names:', s2.bandNames());


// -------------------------------------------------------------
// Predictor stack
// -------------------------------------------------------------
var predictors = s2
  .addBands(s2.normalizedDifference(['NIR', 'Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR', 'SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));


// Optional light vegetation mask
var vegetationMask = predictors.select('NDVI').gt(0.05);


// -------------------------------------------------------------
// Prediction
// -------------------------------------------------------------
var canopyHeight = predictors
  .select(FEATURES)
  .classify(classifier)
  .rename('canopy_height')
  .clamp(0, 50)
  .updateMask(vegetationMask)
  .clip(pakistan);


// -------------------------------------------------------------
// Visualization
// -------------------------------------------------------------
Map.centerObject(pakistan, 6);

Map.addLayer(
  canopyHeight,
  {
    min: 0,
    max: 40,
    palette: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837']
  },
  'Canopy Height (m)'
);

print('Prediction image:', canopyHeight);


// -------------------------------------------------------------
// Export
// -------------------------------------------------------------
Export.image.toAsset({
  image: canopyHeight,
  description: 'canopy_height_pakistan_2025_growing_season',
  assetId: 'projects/adk-crash-course-471706/assets/outputs/canopy_height_2025_growing_season',
  region: pakistan,
  scale: 10,
  pyramidingPolicy: {'.default': 'mean'},
  maxPixels: 1e13
});