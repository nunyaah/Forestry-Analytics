// =============================================================
// DERIVED CANOPY METRICS — Pakistan
// Canopy Base Height (CBH), Canopy Bulk Density (CBD),
// Canopy Layer Count (CLC)
// =============================================================
//
// Inputs : canopy_height_2025_growing_season (m, 10 m)
//          canopy_cover_2025_growing_season  (%, 30 m)
//
// Outputs: cbh_2025  — Canopy Base Height (m)
//          cbd_2025  — Canopy Bulk Density (kg/m³)
//          clc_2025  — Canopy Layer Count  (1–3)
//
// Methodology follows the SLR-style synthesis in cbh+cbd+clc.md:
//   CBH  = r(stratum) × H
//   CCc  = 100 × (1 − exp(−0.01 × CCraw))
//   CBD  = α(stratum) × (CCc / 100) / max(H − CBH, 1)
//   CLC  = heuristic from H and CCc thresholds
//
// References:
//   Crookston & Stage (1999) — canopy cover correction
//   Scott & Reinhardt (2001) — CBD / fire-fuel framework
//   Ritchie & Hann (1987)    — CBH model families
//   Whitehurst et al. (2013) — vertical strata logic
// =============================================================


// ═══════════════════════════════════════════════════════════════
// 0. STUDY AREA
// ═══════════════════════════════════════════════════════════════

var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Pakistan'))
  .geometry();


// ═══════════════════════════════════════════════════════════════
// 1. LOAD EXISTING MAPS
// ═══════════════════════════════════════════════════════════════

var canopyHeight = ee.Image(
  'projects/adk-crash-course-471706/assets/outputs/canopy_height_2025_growing_season'
).rename('H');

var canopyCover = ee.Image(
  'projects/adk-crash-course-471706/assets/outputs/canopy_cover_2025_growing_season'
).rename('CCraw');


// ═══════════════════════════════════════════════════════════════
// 2. CORRECTED CANOPY COVER (Crookston & Stage, 1999)
//    CCc = 100 × (1 − exp(−0.01 × CCraw))
// ═══════════════════════════════════════════════════════════════

var CCc = canopyCover.select('CCraw')
  .multiply(-0.01)
  .exp()
  .multiply(-1)
  .add(1)
  .multiply(100)
  .rename('CCc');


// ═══════════════════════════════════════════════════════════════
// 3. STRATUM MAP — Pakistan's 8 Official Forest Strata
// ═══════════════════════════════════════════════════════════════
//
// Build a stratum classification from elevation, geography,
// and canopy structure to approximate Pakistan's UNFCCC strata.
//
// Stratum codes:
//   1 = Mangrove
//   2 = Riverine
//   3 = Subtropical Broadleaved Scrub
//   4 = Subtropical Pine (Chir pine)
//   5 = Moist Temperate
//   6 = Dry Temperate Conifer
//   7 = Juniper / Chilgoza
//   8 = Sub-Alpine
//   0 = Non-forest / unclassified
//
// This is a rule-based approximation. Geographic polygons
// reflect broad ecological envelopes, not precise boundaries.
// ═══════════════════════════════════════════════════════════════

var srtm      = ee.Image('USGS/SRTMGL1_003');
var elevation = srtm.select('elevation');
var lulc      = ee.Image('projects/adk-crash-course-471706/assets/lulc2020');

// Geographic envelopes (approximate bounding boxes)
var mangroveBBox     = ee.Geometry.Rectangle([66.5, 23.5, 68.5, 25.5]);
var riverineBBox     = ee.Geometry.Rectangle([66.5, 25.5, 72.0, 30.5]);
var subtropPineBBox  = ee.Geometry.Rectangle([72.0, 33.0, 74.5, 34.5]);
var moistTempBBox    = ee.Geometry.Rectangle([70.5, 34.5, 76.0, 37.0]);
var dryTempBBox      = ee.Geometry.Rectangle([70.0, 34.0, 76.0, 37.0]);
var juniperBBox      = ee.Geometry.Rectangle([66.5, 29.5, 69.0, 31.5]);
var subAlpineBBox    = ee.Geometry.Rectangle([70.5, 34.5, 76.0, 37.0]);

// Rasterise geographic envelopes
var inMangrove    = ee.Image.constant(0).paint(mangroveBBox, 1).selfMask();
var inRiverine    = ee.Image.constant(0).paint(riverineBBox, 1).selfMask();
var inSubtropPine = ee.Image.constant(0).paint(subtropPineBBox, 1).selfMask();
var inMoistTemp   = ee.Image.constant(0).paint(moistTempBBox, 1).selfMask();
var inDryTemp     = ee.Image.constant(0).paint(dryTempBBox, 1).selfMask();
var inJuniper     = ee.Image.constant(0).paint(juniperBBox, 1).selfMask();
var inSubAlpine   = ee.Image.constant(0).paint(subAlpineBBox, 1).selfMask();

// Start with 0 (unclassified) and assign strata using
// priority order (more specific strata override broader ones).
var stratum = ee.Image.constant(0).clip(pakistan).toInt();

// --- Stratum 3: Subtropical Broadleaved Scrub ---
// Low-to-mid elevation (300–1500 m), outside specific northern zones
stratum = stratum
  .where(elevation.gte(300).and(elevation.lt(1500))
    .and(canopyHeight.select('H').gt(0)), 3);

// --- Stratum 2: Riverine ---
// Low elevation (<300 m) within the Indus corridor
stratum = stratum
  .where(inRiverine.unmask(0).eq(1)
    .and(elevation.lt(300))
    .and(canopyHeight.select('H').gt(0)), 2);

// --- Stratum 1: Mangrove ---
// Coastal Indus Delta, low elevation (<30 m)
stratum = stratum
  .where(inMangrove.unmask(0).eq(1)
    .and(elevation.lt(30))
    .and(canopyHeight.select('H').gt(0)), 1);

// --- Stratum 4: Subtropical Pine ---
// Mid elevation (800–2000 m) in the Murree/Margalla belt
stratum = stratum
  .where(inSubtropPine.unmask(0).eq(1)
    .and(elevation.gte(800)).and(elevation.lt(2000))
    .and(canopyHeight.select('H').gt(0)), 4);

// --- Stratum 7: Juniper / Chilgoza ---
// Mid-to-high elevation (1500–3500 m) in Balochistan
stratum = stratum
  .where(inJuniper.unmask(0).eq(1)
    .and(elevation.gte(1500)).and(elevation.lt(3500))
    .and(canopyHeight.select('H').gt(0)), 7);

// --- Stratum 5: Moist Temperate ---
// Northern highlands, 2000–3500 m, wetter side (higher cover)
stratum = stratum
  .where(inMoistTemp.unmask(0).eq(1)
    .and(elevation.gte(2000)).and(elevation.lt(3500))
    .and(CCc.gt(30))
    .and(canopyHeight.select('H').gt(0)), 5);

// --- Stratum 6: Dry Temperate ---
// Northern highlands, 2000–3500 m, drier side (lower cover)
stratum = stratum
  .where(inDryTemp.unmask(0).eq(1)
    .and(elevation.gte(2000)).and(elevation.lt(3500))
    .and(CCc.lte(30))
    .and(canopyHeight.select('H').gt(0)), 6);

// --- Stratum 8: Sub-Alpine ---
// Above 3500 m in northern mountains
stratum = stratum
  .where(inSubAlpine.unmask(0).eq(1)
    .and(elevation.gte(3500))
    .and(canopyHeight.select('H').gt(0)), 8);

stratum = stratum.rename('stratum');


// ═══════════════════════════════════════════════════════════════
// 4. STRATUM PARAMETER LOOKUP TABLES
// ═══════════════════════════════════════════════════════════════
//
// r     = CBH/H ratio (mid-range from cbh+cbd+clc.md table)
// alpha = canopy fuel load calibration constant (kg/m²)
//
// Index:  0       1      2      3      4      5      6      7      8
//         non-f   mang   river  scrub  chir   moist  dry    junip  subalp

var rValues     = [0, 0.28, 0.42, 0.18, 0.52, 0.65, 0.58, 0.40, 0.35];
var alphaValues = [0, 0.20, 0.35, 0.15, 0.40, 0.60, 0.50, 0.30, 0.40];

// Build look-up images from the stratum map.
// .remap() maps each stratum code to its parameter value (×1000
// to keep integer precision, then divide back).

var rImage = stratum.remap(
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [0, 280, 420, 180, 520, 650, 580, 400, 350]
).divide(1000).rename('r');

var alphaImage = stratum.remap(
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [0, 200, 350, 150, 400, 600, 500, 300, 400]
).divide(1000).rename('alpha');


// ═══════════════════════════════════════════════════════════════
// 5. CANOPY BASE HEIGHT (CBH)
//    CBH = r × H
// ═══════════════════════════════════════════════════════════════

var H = canopyHeight.select('H');

var CBH = rImage.multiply(H)
  .rename('canopy_base_height');


// ═══════════════════════════════════════════════════════════════
// 6. CANOPY BULK DENSITY (CBD)
//    CFL_proxy = alpha × (CCc / 100)
//    CD        = max(H − CBH, 1)
//    CBD       = CFL_proxy / CD
// ═══════════════════════════════════════════════════════════════

var CFL = alphaImage.multiply(CCc.divide(100))
  .rename('CFL');

var CD = H.subtract(CBH)
  .max(1)
  .rename('CD');

var CBD = CFL.divide(CD)
  .rename('canopy_bulk_density');


// ═══════════════════════════════════════════════════════════════
// 7. CANOPY LAYER COUNT (CLC)
//    Heuristic from Whitehurst et al. (2013) and
//    Crookston & Stage (1999):
//      1 layer  — baseline
//      +1 layer — if H >= 15 m AND CCc >= 30%
//      +1 layer — if H >= 25 m AND CCc >= 60%
//    With stratum-specific overrides for short/open systems.
// ═══════════════════════════════════════════════════════════════

var layers = ee.Image.constant(1).toInt().clip(pakistan);

// Second layer where canopy is tall and moderately closed
layers = layers.where(
  H.gte(15).and(CCc.gte(30)),
  2
);

// Third layer where canopy is very tall and dense
layers = layers.where(
  H.gte(25).and(CCc.gte(60)),
  3
);

// Stratum-specific caps from the methodology document:
//   Mangrove (1): max 2 layers, only if H >= 6 m and CCc >= 40%
//   Scrub (3):    max 2 layers, only if H >= 5 m and CCc >= 40%
//   Juniper (7):  max 2 layers, only in unusually closed stands
//   Sub-Alpine (8): max 2 layers, 1 near treeline

// Cap mangrove at 1 unless tall+closed
layers = layers.where(
  stratum.eq(1).and(
    H.lt(6).or(CCc.lt(40))
  ),
  1
);

// Cap scrub at 1 unless tall+closed
layers = layers.where(
  stratum.eq(3).and(
    H.lt(5).or(CCc.lt(40))
  ),
  1
);

// Cap juniper at max 2
layers = layers.where(
  stratum.eq(7).and(layers.gt(2)),
  2
);

// Cap sub-alpine at max 2
layers = layers.where(
  stratum.eq(8).and(layers.gt(2)),
  2
);

var CLC = layers.rename('canopy_layer_count');


// ═══════════════════════════════════════════════════════════════
// 8. MASK — only where both input maps have valid data
// ═══════════════════════════════════════════════════════════════

var validMask = canopyHeight.select('H').mask()
  .and(canopyCover.select('CCraw').mask());

CBH = CBH.updateMask(validMask);
CBD = CBD.updateMask(validMask);
CLC = CLC.updateMask(validMask);


// ═══════════════════════════════════════════════════════════════
// 9. VISUALISATION
// ═══════════════════════════════════════════════════════════════

Map.centerObject(pakistan, 6);

Map.addLayer(
  stratum.updateMask(validMask).selfMask(),
  {min: 1, max: 8,
   palette: ['#1b9e77','#d95f02','#7570b3','#e7298a',
             '#66a61e','#e6ab02','#a6761d','#666666']},
  'Forest Stratum', false
);

Map.addLayer(
  CBH,
  {min: 0, max: 25,
   palette: ['#ffffcc','#c7e9b4','#7fcdbb','#41b6c4','#225ea8']},
  'Canopy Base Height (m)'
);

Map.addLayer(
  CBD,
  {min: 0, max: 0.15,
   palette: ['#fff7ec','#fee8c8','#fdd49e','#fdbb84',
             '#fc8d59','#ef6548','#d7301f','#990000']},
  'Canopy Bulk Density (kg/m³)'
);

Map.addLayer(
  CLC,
  {min: 1, max: 3,
   palette: ['#fecc5c','#fd8d3c','#e31a1c']},
  'Canopy Layer Count'
);

// Also show input layers for reference
Map.addLayer(
  canopyHeight.select('H'),
  {min: 0, max: 40,
   palette: ['#ffffcc','#c2e699','#78c679','#31a354','#006837']},
  'Input: Canopy Height (m)', false
);

Map.addLayer(
  canopyCover.select('CCraw'),
  {min: 0, max: 80,
   palette: ['#ffffcc','#78c679','#238443','#005a32']},
  'Input: Canopy Cover (%)', false
);

print('──── Derived Canopy Metrics ────');
print('CBH image:', CBH);
print('CBD image:', CBD);
print('CLC image:', CLC);
print('Stratum image:', stratum);


// ═══════════════════════════════════════════════════════════════
// 10. EXPORT TO ASSETS
// ═══════════════════════════════════════════════════════════════

Export.image.toAsset({
  image: CBH,
  description: 'canopy_base_height_pakistan_2025',
  assetId: 'projects/adk-crash-course-471706/assets/outputs/cbh_2025_growing_season',
  region: pakistan,
  scale: 10,
  pyramidingPolicy: {'.default': 'mean'},
  maxPixels: 1e13
});

Export.image.toAsset({
  image: CBD,
  description: 'canopy_bulk_density_pakistan_2025',
  assetId: 'projects/adk-crash-course-471706/assets/outputs/cbd_2025_growing_season',
  region: pakistan,
  scale: 10,
  pyramidingPolicy: {'.default': 'mean'},
  maxPixels: 1e13
});

Export.image.toAsset({
  image: CLC.toFloat(),
  description: 'canopy_layer_count_pakistan_2025',
  assetId: 'projects/adk-crash-course-471706/assets/outputs/clc_2025_growing_season',
  region: pakistan,
  scale: 10,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1e13
});
