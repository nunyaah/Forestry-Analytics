// =============================================================
// SHARED SETUP — copy this block at the top of every script
// =============================================================

var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var SCALE    = 30;
var PTS_PER_STRATUM = 1500;

// --- Datasets ---
var lulc         = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen       = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var treecover2000 = hansen.select('treecover2000');
var loss         = hansen.select('lossyear');
var srtm         = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan'))
  .geometry();

// --- Forest mask ---
var lulc_forest    = lulc.eq(1);
var hansen_forest  = treecover2000.gte(25).and(loss.eq(0));
var finalForestMask = lulc_forest.or(hansen_forest).selfMask().clip(pakistan);

// --- Landsat cloud masking ---
function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var cloud       = qa.bitwiseAnd(1 << 3).neq(0);
  var cloudShadow = qa.bitwiseAnd(1 << 4).neq(0);
  var snow        = qa.bitwiseAnd(1 << 5).neq(0);
  var cirrus      = qa.bitwiseAnd(1 << 2).neq(0);
  var clear = cloud.or(cloudShadow).or(snow).or(cirrus).not();
  return image.updateMask(clear);
}
function applyScale(image) {
  var scaled = image.select(BAND_IN).multiply(0.0000275).add(-0.2);
  return image.addBands(scaled, null, true);
}
function buildLandsat(collectionId) {
  return ee.ImageCollection(collectionId)
    .filterDate('1998-01-01', '2004-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))  // Apr-Oct: avoids winter cloud/snow
    .filterBounds(pakistan)
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN, BAND_OUT);
}

var landsat = buildLandsat('LANDSAT/LT05/C02/T1_L2')
  .merge(buildLandsat('LANDSAT/LE07/C02/T1_L2'))
  .median()
  .clip(pakistan);

var ndvi = landsat.normalizedDifference(['NIR','Red']).rename('NDVI');
var ndmi = landsat.normalizedDifference(['NIR','SWIR1']).rename('NDMI');
var elevation = srtm.select('elevation').rename('Elevation');
var slope     = ee.Terrain.slope(srtm).rename('Slope');
var aspect    = ee.Terrain.aspect(srtm).rename('Aspect');

var predictors = landsat.addBands([ndvi, ndmi, elevation, slope, aspect]);

// --- Label + stratum ---
var label = treecover2000.rename('canopy_cover').clip(pakistan);
// unmask(0) ensures Hansen no-data pixels inside Pakistan default to stratum 1.
// toInt() required: stratifiedSample classBand must be integer.
var stratum = ee.Image(0)
  .where(label.unmask(0).lt(30), 1)
  .where(label.unmask(0).gte(30).and(label.unmask(0).lt(60)), 2)
  .where(label.unmask(0).gte(60), 3)
  .rename('stratum')
  .toInt();

var stack = predictors.addBands(label).addBands(stratum);

// --- Required properties filter ---
var requiredProps = [
  'Blue','Green','Red','NIR','SWIR1','SWIR2',
  'NDVI','NDMI','Elevation','Slope','Aspect',
  'canopy_cover','stratum','region','sampling_group','forest_mask'
];
