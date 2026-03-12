// =============================================================
// STEP — Southern forest ecosystems (Mangroves + Juniper)
// Output: canopy_height_00_southern_forests.csv
// =============================================================

var BAND_IN  = ['B2','B3','B4','B8','B11','B12'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var SCALE = 10;
var PTS_PER_STRATUM = 1500;

// ── Data ─────────────────────────────────────────────────────
var eth  = ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1');
var srtm = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan'))
  .geometry();


// ── Sentinel-2 preprocessing ─────────────────────────────────
function maskClouds(image) {

  var qa = image.select('QA60');

  return image.updateMask(
    qa.bitwiseAnd(1 << 10).eq(0)
      .and(qa.bitwiseAnd(1 << 11).eq(0))
  );
}

function applyScale(image) {

  return image.addBands(
    image.select(BAND_IN).multiply(0.0001),
    null,
    true
  );
}

function buildSentinel2() {

  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate('2019-01-01','2021-12-31')
    .filter(ee.Filter.calendarRange(4,10,'month'))
    .filterBounds(pakistan)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',30))
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN,BAND_OUT);

}

var s2 = buildSentinel2()
  .median()
  .clip(pakistan);


// ── Predictor stack ──────────────────────────────────────────
var predictors = s2
  .addBands(s2.normalizedDifference(['NIR','Red']).rename('NDVI'))
  .addBands(s2.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'))
  .addBands(ee.Terrain.aspect(srtm).rename('Aspect'));


// ── Label + strata ───────────────────────────────────────────
var label = eth.select('b1')
  .unmask(0)
  .rename('canopy_height')
  .clip(pakistan);

// sparse southern forests → lower bins
var stratum = ee.Image(1)
  .where(label.gte(3).and(label.lt(10)),2)
  .where(label.gte(10),3)
  .rename('stratum')
  .toInt();

var stack = predictors
  .addBands(label)
  .addBands(stratum);


// ── Spatial block split (10 km) ──────────────────────────────
function addSpatialBlockSplit(fc){

  return fc.map(function(f){

    var coords = f.geometry().coordinates();

    var lon = ee.Number(coords.get(0));
    var lat = ee.Number(coords.get(1));

    var blockX = lon.multiply(111).divide(10).floor();
    var blockY = lat.multiply(111).divide(10).floor();

    var blockId = blockX.multiply(10000).add(blockY);

    var hash = blockId.multiply(7919).add(42).mod(997);

    var splitVal = hash.divide(997);

    return f.set('block_id',blockId,'split',splitVal);

  });

}


// ── Region A — Indus Delta Mangroves ─────────────────────────
var mangroveGeom = ee.Geometry.Rectangle([66.8,23.7,68.3,25.1]);

var mangroveSamples = stack
  .stratifiedSample({

    numPoints: PTS_PER_STRATUM,
    classBand: 'stratum',
    region: mangroveGeom,
    scale: SCALE,
    seed: 42,
    geometries: true,
    tileScale: 16,
    dropNulls: true

  })
  .map(function(f){

    return f.set({

      region:'mangrove',
      sampling_group:'forest'

    });

  });


// ── Region B — Ziarat Juniper Forest ─────────────────────────
var juniperGeom = ee.Geometry.Rectangle([67.0,29.8,68.6,31.3]);

var juniperSamples = stack
  .stratifiedSample({

    numPoints: PTS_PER_STRATUM,
    classBand: 'stratum',
    region: juniperGeom,
    scale: SCALE,
    seed: 43,
    geometries: true,
    tileScale: 16,
    dropNulls: true

  })
  .map(function(f){

    return f.set({

      region:'juniper',
      sampling_group:'forest'

    });

  });


// ── Merge + spatial split ────────────────────────────────────
var samples = mangroveSamples.merge(juniperSamples);

samples = addSpatialBlockSplit(samples);

print('Mangrove samples:', mangroveSamples.size());
print('Juniper samples:', juniperSamples.size());
print('Total samples:', samples.size());


// ── Export ───────────────────────────────────────────────────
Export.table.toDrive({

  collection: samples,
  description: 'canopy_height_00_southern_forests',
  folder: 'gee_exports',
  fileNamePrefix: 'canopy_height_00_southern_forests',
  fileFormat: 'CSV'

});