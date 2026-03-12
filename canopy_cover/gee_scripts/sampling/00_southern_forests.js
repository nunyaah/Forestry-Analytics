// =============================================================
// Southern forests sampling (Mangrove + Juniper)
// =============================================================

var SCALE = 30;
var PTS_PER_STRATUM = 1500;

var BAND_IN  = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var BAND_OUT = ['Blue','Green','Red','NIR','SWIR1','SWIR2'];

var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var srtm   = ee.Image('USGS/SRTMGL1_003');

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na','Pakistan')).geometry();


// -------------------------------------------------------------
// Landsat build
// -------------------------------------------------------------

function maskClouds(image){

  var qa = image.select('QA_PIXEL');

  var clear = qa.bitwiseAnd(1<<3).eq(0)
    .and(qa.bitwiseAnd(1<<4).eq(0))
    .and(qa.bitwiseAnd(1<<2).eq(0));

  return image.updateMask(clear);

}

function applyScale(image){

  return image.addBands(
    image.select(BAND_IN).multiply(0.0000275).add(-0.2),
    null,
    true
  );

}

function buildLandsat(id){

  return ee.ImageCollection(id)
    .filterDate('1998-01-01','2004-12-31')
    .filterBounds(pakistan)
    .map(maskClouds)
    .map(applyScale)
    .select(BAND_IN,BAND_OUT);

}

var landsat = buildLandsat('LANDSAT/LT05/C02/T1_L2')
  .merge(buildLandsat('LANDSAT/LE07/C02/T1_L2'))
  .median();


// -------------------------------------------------------------
// Predictors
// -------------------------------------------------------------

var ndvi = landsat.normalizedDifference(['NIR','Red']).rename('NDVI');

var predictors = landsat
  .addBands(ndvi)
  .addBands(landsat.normalizedDifference(['NIR','SWIR1']).rename('NDMI'))
  .addBands(srtm.select('elevation').rename('Elevation'))
  .addBands(ee.Terrain.slope(srtm).rename('Slope'));


// -------------------------------------------------------------
// Label
// -------------------------------------------------------------

var label = hansen.select('treecover2000')
  .rename('canopy_cover');


// -------------------------------------------------------------
// Strata
// -------------------------------------------------------------

var stratum = ee.Image(1)
  .where(label.gte(20),2)
  .where(label.gte(40),3)
  .rename('stratum')
  .toInt();

var stack = predictors.addBands(label).addBands(stratum);


// -------------------------------------------------------------
// Regions
// -------------------------------------------------------------

var mangroveGeom = ee.Geometry.Rectangle([66.8,23.7,68.3,25.1]);

var juniperGeom  = ee.Geometry.Rectangle([67.0,29.8,68.6,31.3]);

// -------------------------------------------------------------
// Mangrove sampling
// -------------------------------------------------------------

var mangroveSamples = stack.stratifiedSample({

  numPoints: PTS_PER_STRATUM,

  classBand: 'stratum',

  region: mangroveGeom,

  scale: SCALE,

  seed: 42,

  geometries: true,

  tileScale: 8

}).map(function(f){

  return f.set({

    region:'mangrove',
    sampling_group:'forest'

  });

});


// -------------------------------------------------------------
// Juniper sampling
// -------------------------------------------------------------

var juniperSamples = stack.stratifiedSample({

  numPoints: PTS_PER_STRATUM,

  classBand: 'stratum',

  region: juniperGeom,

  scale: SCALE,

  seed: 43,

  geometries: true,

  tileScale: 8

}).map(function(f){

  return f.set({

    region:'juniper',
    sampling_group:'forest'

  });

});


// -------------------------------------------------------------
// Merge
// -------------------------------------------------------------

var samples = mangroveSamples.merge(juniperSamples);

print("Mangrove",mangroveSamples.size());
print("Juniper",juniperSamples.size());
print("Total",samples.size());


// -------------------------------------------------------------
// Export
// -------------------------------------------------------------

Export.table.toDrive({

  collection:samples,

  description:'canopy_cover_00_southern_forests',

  folder:'gee_exports',

  fileNamePrefix:'canopy_cover_00_southern_forests',

  fileFormat:'CSV'

});