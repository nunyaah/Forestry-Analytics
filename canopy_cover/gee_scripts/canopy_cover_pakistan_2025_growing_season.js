// =============================================================
// CANOPY COVER PREDICTION — Pakistan
// Simple and safer version
// =============================================================

var classifier = ee.Classifier.load(
  'projects/adk-crash-course-471706/assets/models/rf_canopy_cover'
);

var FEATURES = [
  'Blue','Green','Red','NIR','SWIR1','SWIR2',
  'NDVI','NDMI','Elevation','Slope','Aspect'
];

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na','Pakistan'))
  .geometry();

var srtm = ee.Image('USGS/SRTMGL1_003');

function maskClouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0)
    .and(qa.bitwiseAnd(1 << 11).eq(0));
  return image.updateMask(mask);
}

function prepareImage(image) {
  return image
    .select(BAND_IN)
    .multiply(0.0001)
    .rename(BAND_OUT)
    .copyProperties(image, ['system:time_start']);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-01-01', '2026-01-01')
  .filter(ee.Filter.calendarRange(4, 10, 'month'))
  .filterBounds(pakistan)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .map(maskClouds)
  .map(prepareImage)
  .median()
  .clip(pakistan);

var predictors = s2
  .addBands(s2.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));

var vegetationMask = predictors.select('NDVI').gt(0.05);

var canopyCover = predictors
  .select(FEATURES)
  .classify(classifier)
  .rename('canopy_cover')
  .clamp(0, 100)
  .updateMask(vegetationMask)
  .clip(pakistan);

Map.centerObject(pakistan, 6);
Map.addLayer(
  canopyCover,
  {min: 0, max: 80, palette: ['#ffffcc','#78c679','#238443','#005a32']},
  'Canopy Cover'
);

Export.image.toAsset({
  image: canopyCover,
  description: 'canopy_cover_pakistan_2025_growing_season_v2',
  assetId: 'projects/adk-crash-course-471706/assets/outputs/canopy_cover_2025_growing_season_v2',
  region: pakistan,
  scale: 30,
  pyramidingPolicy: {'.default': 'mean'},
  maxPixels: 1e13
});