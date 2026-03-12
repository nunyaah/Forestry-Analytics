// =============================================================
// CANOPY HEIGHT — STEP 6 of 6 — Non-forest samples (whole Pakistan)
// Expected output: canopy_height_06_non_forest.csv (~5000 rows)
// =============================================================

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var SCALE    = 10;
var PTS_NON_FOREST = 5000;

var eth    = ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1');
var lulc   = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var srtm   = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

var lulc_forest     = lulc.unmask(0).eq(1);
var hansen_forest   = hansen.select('treecover2000').gte(25)
                        .and(hansen.select('lossyear').eq(0));
var finalForestMask = lulc_forest.or(hansen_forest).selfMask().clip(pakistan);

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

// Label: ETH height (should be 0 in non-forest areas; unmask(0) handles nulls)
var label   = eth.select('b1').unmask(0).rename('canopy_height').clip(pakistan);
var stratum = ee.Image(0)
  .where(label.lt(5),                     1)
  .where(label.gte(5).and(label.lt(15)),  2)
  .where(label.gte(15),                   3)
  .rename('stratum').toInt();

var stack = predictors.addBands(label).addBands(stratum);

// --- Non-forest mask ---
// Invert the forest mask so we sample only non-forest areas
var nonForestStack = stack.updateMask(finalForestMask.unmask(0).not().selfMask());

// Oversample 5x then limit: ensures PTS_NON_FOREST even after dropNulls
var samples = nonForestStack.sample({
  region:     pakistan,
  scale:      SCALE,
  numPixels:  PTS_NON_FOREST * 5,
  seed:       999,
  geometries: true,
  tileScale:  16
}).limit(PTS_NON_FOREST).map(function(f) {
  return f.set({region: 'non_forest', sampling_group: 'non_forest',
                forest_mask: 0, stratum: 0});
});

var requiredProps = ['Blue','Green','Red','NIR','SWIR1','SWIR2',
  'NDVI','NDMI','Elevation','Slope','Aspect',
  'canopy_height','stratum','region','sampling_group','forest_mask'];

samples = samples.filter(ee.Filter.notNull(requiredProps))
                 .randomColumn('split', 42);

print('Sample count (may take a moment):', samples.size());

Export.table.toDrive({
  collection:     samples,
  description:    'canopy_height_06_non_forest',
  folder:         'gee_exports',
  fileNamePrefix: 'canopy_height_06_non_forest',
  fileFormat:     'CSV'
});
// Click "Run", then go to Tasks tab and click "Run" next to the task.
