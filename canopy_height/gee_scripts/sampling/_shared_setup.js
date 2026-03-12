// =============================================================
// CANOPY HEIGHT — Shared Setup Reference
// Copy this boilerplate into each region script.
// =============================================================
//
// Label   : ETH Global Canopy Height 2020 (10 m)
// Imagery : Sentinel-2 SR Harmonised, 2019-2021, Apr-Oct
// Strata  : 1 = short (0-<5 m)  2 = moderate (5-<15 m)  3 = tall (≥15 m)
// =============================================================

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];
var SCALE    = 10;              // Sentinel-2 native resolution (m)
var PTS_PER_STRATUM = 1500;

// ── Data sources ─────────────────────────────────────────────
// NOTE: ETH asset requires access — if you see "not found" open
//       https://gee-community-catalog.org and search for "ETH canopy height"
//       for the current public asset path.
var eth    = ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1');
var lulc   = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');
var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var srtm   = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan')).geometry();

// ── Forest mask ───────────────────────────────────────────────
var lulc_forest     = lulc.unmask(0).eq(1);
var hansen_forest   = hansen.select('treecover2000').gte(25)
                        .and(hansen.select('lossyear').eq(0));
var finalForestMask = lulc_forest.or(hansen_forest).selfMask().clip(pakistan);

// ── Sentinel-2 cloud masking ──────────────────────────────────
function maskClouds(image) {
  var qa = image.select('QA60');
  return image.updateMask(
    qa.bitwiseAnd(1 << 10).eq(0)   // opaque clouds
      .and(qa.bitwiseAnd(1 << 11).eq(0))  // cirrus
  );
}

function applyScale(image) {
  return image.addBands(
    image.select(BAND_IN).multiply(0.0001), null, true
  );
}

function buildSentinel2() {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate('2019-01-01', '2021-12-31')
    .filter(ee.Filter.calendarRange(4, 10, 'month'))   // Apr-Oct: avoid snow
    .filterBounds(pakistan)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN, BAND_OUT);
}

var s2 = buildSentinel2().median().clip(pakistan);

// ── Predictor stack ───────────────────────────────────────────
var predictors = s2
  .addBands(s2.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));

// ── Label + strata ────────────────────────────────────────────
// unmask(0): outside ETH coverage → height 0 (treated as no canopy)
// toInt()  : stratifiedSample requires integer classBand
var label   = eth.select('b1').unmask(0).rename('canopy_height').clip(pakistan);
var stratum = ee.Image(0)
  .where(label.lt(5),                     1)   // short    : 0 – <5 m
  .where(label.gte(5).and(label.lt(15)),  2)   // moderate : 5 – <15 m
  .where(label.gte(15),                   3)   // tall     : ≥15 m
  .rename('stratum').toInt();

var stack = predictors.addBands(label).addBands(stratum);

// ── Region (fill in per script) ───────────────────────────────
var regionName = 'himalayan';
var regionGeom = ee.Geometry.Rectangle([71.0, 34.8, 73.5, 36.2]);

// ── Sample ────────────────────────────────────────────────────
var samples = stack
  .updateMask(finalForestMask)
  .stratifiedSample({
    numPoints:   PTS_PER_STRATUM,
    classBand:   'stratum',
    region:      regionGeom,
    scale:       SCALE,
    seed:        42,
    geometries:  true,
    tileScale:   16,       // 10 m → 9× more pixels than 30 m; use 16 to avoid OOM
    dropNulls:   true,
    classValues: [1, 2, 3],
    classPoints: [PTS_PER_STRATUM, PTS_PER_STRATUM, PTS_PER_STRATUM]
  })
  .map(function(f) {
    return f.set({region: regionName, sampling_group: 'forest', forest_mask: 1});
  })
  .randomColumn('split', 42);

print('Sample count:', samples.size());

Export.table.toDrive({
  collection:     samples,
  description:    'canopy_height_01_himalayan',
  folder:         'gee_exports',
  fileNamePrefix: 'canopy_height_01_himalayan',
  fileFormat:     'CSV'
});
