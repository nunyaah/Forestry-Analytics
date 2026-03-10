// =============================================================
// STEP 4 of 6 — Riverine forest region
// Expected output: canopy_cover_04_riverine.csv (~4500 rows)
// =============================================================

var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var SCALE    = 30;
var PTS_PER_STRATUM = 1500;

var lulc          = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen        = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var treecover2000 = hansen.select('treecover2000');
var loss          = hansen.select('lossyear');
var srtm          = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

var lulc_forest     = lulc.unmask(0).eq(1);
var hansen_forest   = treecover2000.gte(25).and(loss.eq(0));
var finalForestMask = lulc_forest.or(hansen_forest).selfMask().clip(pakistan);

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
    .filterDate('1998-01-01','2004-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))  // Apr-Oct: avoids winter cloud/snow
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

var label   = treecover2000.rename('canopy_cover').clip(pakistan);
var stratum = ee.Image(0)
  .where(label.unmask(0).lt(30), 1)
  .where(label.unmask(0).gte(30).and(label.unmask(0).lt(60)), 2)
  .where(label.unmask(0).gte(60), 3).rename('stratum').toInt();

var stack = predictors.addBands(label).addBands(stratum);

// --- Region ---
// AJK + Neelum/Jhelum/Kunhar river valleys — expanded to ensure all strata
var regionName = 'riverine';
var regionGeom = ee.Geometry.Rectangle([72.8, 33.8, 75.0, 35.5]);

var samples = stack
  .updateMask(finalForestMask)
  .stratifiedSample({
    numPoints: PTS_PER_STRATUM,
    classBand: 'stratum',
    region: regionGeom,
    scale: SCALE,
    seed: 42,
    geometries: true,
    tileScale: 8,
    dropNulls: true,
    classValues: [1, 2, 3],
    classPoints: [PTS_PER_STRATUM, PTS_PER_STRATUM, PTS_PER_STRATUM]
  })
  .map(function(f) {
    return f.set({region: regionName, sampling_group: 'forest', forest_mask: 1});
  })
  .randomColumn('split', 42);

print('Sample count (may take a moment):', samples.size());

Export.table.toDrive({
  collection: samples,
  description: 'canopy_cover_04_riverine',
  folder: 'gee_exports',
  fileNamePrefix: 'canopy_cover_04_riverine',
  fileFormat: 'CSV'
});
// Click "Run", then go to Tasks tab and click "Run" next to the task.
