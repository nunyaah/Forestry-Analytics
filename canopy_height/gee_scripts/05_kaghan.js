// =============================================================
// CANOPY HEIGHT — STEP 5 of 6 — Kaghan / upper Hazara subalpine conifers
// Expected output: canopy_height_05_kaghan.csv (~4500 rows)
// Region: Kaghan valley, Naran, upper Hazara
// =============================================================

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var SCALE    = 10;
var PTS_PER_STRATUM = 1500;

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

var label   = eth.select('b1').unmask(0).rename('canopy_height').clip(pakistan);
var stratum = ee.Image(0)
  .where(label.lt(5),                     1)
  .where(label.gte(5).and(label.lt(15)),  2)
  .where(label.gte(15),                   3)
  .rename('stratum').toInt();

var stack = predictors.addBands(label).addBands(stratum);

// --- Region ---
// Expanded to cover full Kaghan + upper Hazara belt
var regionName = 'kaghan';
var regionGeom = ee.Geometry.Rectangle([73.5, 34.2, 75.5, 36.5]);

var samples = stack
  .updateMask(finalForestMask)
  .stratifiedSample({
    numPoints:   PTS_PER_STRATUM,
    classBand:   'stratum',
    region:      regionGeom,
    scale:       SCALE,
    seed:        42,
    geometries:  true,
    tileScale:   16,
    dropNulls:   true,
    classValues: [1, 2, 3],
    classPoints: [PTS_PER_STRATUM, PTS_PER_STRATUM, PTS_PER_STRATUM]
  })
  .map(function(f) {
    return f.set({region: regionName, sampling_group: 'forest', forest_mask: 1});
  })
  .randomColumn('split', 42);

print('Sample count (may take a moment):', samples.size());

Export.table.toDrive({
  collection:     samples,
  description:    'canopy_height_05_kaghan',
  folder:         'gee_exports',
  fileNamePrefix: 'canopy_height_05_kaghan',
  fileFormat:     'CSV'
});
// Click "Run", then go to Tasks tab and click "Run" next to the task.
