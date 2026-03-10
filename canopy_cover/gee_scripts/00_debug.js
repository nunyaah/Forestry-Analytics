// =============================================================
// DIAGNOSTIC — run this FIRST to see what's actually in each region
// Open GEE Code Editor, paste, click Run, then check the Console tab
// =============================================================

var lulc          = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen        = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var treecover2000 = hansen.select('treecover2000');
var loss          = hansen.select('lossyear');
var srtm          = ee.Image('USGS/SRTMGL1_003');
var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

var lulc_forest    = lulc.unmask(0).eq(1);
var hansen_forest  = treecover2000.gte(25).and(loss.eq(0));
var finalForestMask = lulc_forest.or(hansen_forest).selfMask().clip(pakistan);

function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  // Snow bit (1<<5) removed — too aggressive for mountainous forest areas
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
    .filterDate('1999-01-01','2002-12-31').filterBounds(pakistan)
    .map(maskClouds).map(applyScale).select(BAND_IN, BAND_OUT);
}

var landsat = buildLandsat('LANDSAT/LT05/C02/T1_L2')
  .merge(buildLandsat('LANDSAT/LE07/C02/T1_L2')).median().clip(pakistan);

var label   = treecover2000.rename('canopy_cover').clip(pakistan);
var stratum = ee.Image(0)
  .where(label.lt(30), 1)
  .where(label.gte(30).and(label.lt(60)), 2)
  .where(label.gte(60), 3).rename('stratum');

var stack = landsat
  .addBands(landsat.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(landsat.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'))
  .addBands(label).addBands(stratum);

var REGIONS = {
  // Swat, Chitral, Upper Dir
  'himalayan':        ee.Geometry.Rectangle([71.0, 34.8, 73.5, 36.2]),
  // Murree, Abbottabad, Hazara
  'temperate':        ee.Geometry.Rectangle([73.2, 33.8, 74.5, 35.0]),
  // Unchanged — already working
  'subtropical_pine': ee.Geometry.Rectangle([72.8, 33.4, 73.9, 34.6]),
  // Neelum Valley, AJK — dense montane riverine forests
  'riverine':         ee.Geometry.Rectangle([73.5, 34.0, 74.5, 34.8]),
  // Kaghan Valley, Mansehra — replaces dry_balochistan (no Hansen coverage there)
  'kaghan':           ee.Geometry.Rectangle([73.8, 34.5, 74.5, 35.2]),
};

// For each region, count pixels at coarse scale (fast)
Object.keys(REGIONS).forEach(function(name) {
  var geom = REGIONS[name];

  // 1. Forest mask pixel count
  var forestCount = finalForestMask.reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geom, scale: 500, maxPixels: 1e9
  });

  // 2. Valid Landsat (Red band) pixel count
  var landsatCount = landsat.select('Red').reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geom, scale: 500, maxPixels: 1e9
  });

  // 3. Forest + Landsat overlap count (what sample() actually sees)
  var overlapCount = stack.select('Red').updateMask(finalForestMask).reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geom, scale: 500, maxPixels: 1e9
  });

  // 4. Stratum breakdown inside forest mask
  var stratumHist = stratum.updateMask(finalForestMask).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: geom, scale: 500, maxPixels: 1e9
  });

  print('--- ' + name + ' ---');
  print('  forest pixels (500m scale):', forestCount);
  print('  landsat pixels (500m scale):', landsatCount);
  print('  forest+landsat overlap:', overlapCount);
  print('  stratum histogram in forest:', stratumHist);
});

// -------------------------------------------------------
// Extra: test kaghan with gte(25) to confirm it works
// -------------------------------------------------------
var dryRegions = {
  'kaghan_check': ee.Geometry.Rectangle([73.8, 34.5, 74.5, 35.2]),
};

Object.keys(dryRegions).forEach(function(name) {
  var geom = dryRegions[name];
  var overlap = stack.select('Red').updateMask(finalForestMask).reduceRegion({
    reducer: ee.Reducer.count(), geometry: geom, scale: 500, maxPixels: 1e9
  });
  var hist = stratum.updateMask(finalForestMask).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry: geom, scale: 500, maxPixels: 1e9
  });
  print('--- ' + name + ' ---');
  print('  forest+landsat overlap:', overlap);
  print('  stratum histogram:', hist);
});

// Also visualise forest mask on map
Map.addLayer(finalForestMask, {palette: ['00ff00']}, 'Forest Mask');
Map.addLayer(landsat.select(['Red','NIR','Green']), {min:0, max:0.3, bands:['NIR','Red','Green']}, 'Landsat');
Map.setCenter(72.5, 35.0, 7);
