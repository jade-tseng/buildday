// ============================================================
// AlphaEarth Ecological Similarity Search
// Reference: American Prairie Reserve, Northern Great Plains, MT
//
// TO USE WITH ALPHAEARTH EMBEDDINGS:
//   Replace section [2b] with your AlphaEarth asset/endpoint call.
//   The similarity math in sections [3]–[5] is identical either way.
// ============================================================

// ----------------------------------------------------------
// [1] Reference region — American Prairie project footprint
// ----------------------------------------------------------
// Core management zone across Phillips, Valley & Fergus counties, MT.
// Upload the official project shapefile as an EE asset for precision;
// this polygon covers the ~3.2M acre vision area.
var americanPrairie = ee.Geometry.Polygon(
  [[[-109.2, 46.8],
    [-105.6, 46.8],
    [-105.6, 49.0],
    [-109.2, 49.0],
    [-109.2, 46.8]]], null, false);

var globalBounds = ee.Geometry.Rectangle([-180, -60, 180, 85], 'EPSG:4326', false);

Map.centerObject(americanPrairie, 5);


// ----------------------------------------------------------
// [2a] Build ecological feature stack (12 bands)
//      Skip this block and use [2b] if you have AlphaEarth
//      embeddings — they will replace `features` below.
// ----------------------------------------------------------

// Climate — WorldClim v1 bioclimatic variables
var bio = ee.Image('WORLDCLIM/V1/BIO');
var climate = bio.select([
  'bio01',  // Annual Mean Temperature (× 10 °C)
  'bio04',  // Temperature Seasonality (std × 100)
  'bio05',  // Max Temp Warmest Month
  'bio06',  // Min Temp Coldest Month
  'bio12',  // Annual Precipitation (mm)
  'bio15',  // Precipitation Seasonality (CV)
  'bio17',  // Precip of Driest Quarter
]);

// Vegetation phenology — MODIS 16-day NDVI 2018-2023 composite
var modis = ee.ImageCollection('MODIS/061/MOD13A1')
  .filterDate('2018-01-01', '2023-12-31')
  .select('NDVI');

var ndviMean        = modis.mean().multiply(0.0001).rename('ndvi_mean');
var ndviP10         = modis.reduce(ee.Reducer.percentile([10])).multiply(0.0001).rename('ndvi_p10');
var ndviP90         = modis.reduce(ee.Reducer.percentile([90])).multiply(0.0001).rename('ndvi_p90');
var ndviSeasonality = ndviP90.subtract(ndviP10).rename('ndvi_seasonality');

// Topography — SRTM 30m
var terrain   = ee.Terrain.products(ee.Image('USGS/SRTMGL1_003'));
var elevation = terrain.select('elevation').rename('elevation');
var slope     = terrain.select('slope').rename('slope');

// Soil — OpenLandMap (0–10 cm)
var soilSand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02')
  .select('b10').rename('soil_sand');
var soilOC   = ee.Image('OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02')
  .select('b10').rename('soil_oc');

// Combine into single multi-band feature image
var features = ee.Image.cat([
  climate,
  ndviMean, ndviSeasonality,
  elevation, slope,
  soilSand, soilOC
]).rename([
  'temp_annual', 'temp_seasonality', 'temp_max', 'temp_min',
  'precip_annual', 'precip_seasonality', 'precip_dry_qtr',
  'ndvi_mean', 'ndvi_seasonality',
  'elevation', 'slope',
  'soil_sand', 'soil_oc'
]);


// ----------------------------------------------------------
// [2b] AlphaEarth embeddings (replace [2a] when available)
//
// Option A — pre-computed EE asset:
//   var features = ee.Image('projects/YOUR_PROJECT/assets/alphaearth_embeddings');
//
// Option B — Vertex AI model inference:
//   var aeModel = ee.Model.fromVertexAi({
//     endpoint: 'projects/YOUR_PROJECT/locations/us-central1/endpoints/ENDPOINT_ID',
//     inputTileSize: [256, 256],
//     inputOverlapSize: [32, 32],
//     outputBands: {
//       'embedding': {type: ee.PixelType.float32(), dimensions: 768}
//     }
//   });
//   // Build a base Sentinel-2 / Landsat composite as model input, then:
//   var features = aeModel.predictImage(baseComposite);
// ----------------------------------------------------------


// ----------------------------------------------------------
// [3] Normalize to z-scores (globally)
// ----------------------------------------------------------
var bandNames = features.bandNames();

var globalStats = features.reduceRegion({
  reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), null, true),
  geometry: globalBounds,
  scale: 10000,
  maxPixels: 1e10,
  bestEffort: true,
  tileScale: 4
});

var meanImg = ee.Image.constant(
  bandNames.map(function(b) { return globalStats.getNumber(ee.String(b).cat('_mean')); })
).rename(bandNames);

var stdImg  = ee.Image.constant(
  bandNames.map(function(b) { return globalStats.getNumber(ee.String(b).cat('_stdDev')); })
).rename(bandNames);

// Clamp std to avoid divide-by-zero on flat bands
var normalized = features.subtract(meanImg).divide(stdImg.max(1e-6));


// ----------------------------------------------------------
// [4] Reference signature — mean z-score over American Prairie
// ----------------------------------------------------------
var refDict = normalized.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: americanPrairie,
  scale: 5000,
  maxPixels: 1e9,
  bestEffort: true
});

var refImg = ee.Image.constant(
  bandNames.map(function(b) { return refDict.getNumber(b); })
).rename(bandNames);

print('American Prairie ecological signature (z-scores):', refDict);


// ----------------------------------------------------------
// [5] Similarity search — cosine similarity
//     Score 1.0 = ecologically identical  |  0.0 = orthogonal
// ----------------------------------------------------------
var dot     = normalized.multiply(refImg).reduce(ee.Reducer.sum());
var normPx  = normalized.pow(2).reduce(ee.Reducer.sum()).sqrt();
var normRef = refImg.pow(2).reduce(ee.Reducer.sum()).sqrt();

var cosine = dot.divide(normPx.multiply(normRef))
  .rename('cosine_similarity')
  .clip(globalBounds);

// Euclidean distance (secondary metric; smaller = more similar)
var euclidean = normalized.subtract(refImg)
  .pow(2).reduce(ee.Reducer.sum()).sqrt()
  .rename('euclidean_distance')
  .clip(globalBounds);


// ----------------------------------------------------------
// [6] Identify top-similar regions (global 95th percentile)
// ----------------------------------------------------------
var p95 = cosine.reduceRegion({
  reducer: ee.Reducer.percentile([95]),
  geometry: globalBounds,
  scale: 25000,
  maxPixels: 1e10,
  bestEffort: true
}).getNumber('cosine_similarity');

var topSimilar = cosine.updateMask(cosine.gte(p95));

print('Global cosine similarity percentiles:', cosine.reduceRegion({
  reducer: ee.Reducer.percentile([50, 75, 90, 95, 99]),
  geometry: globalBounds,
  scale: 25000,
  maxPixels: 1e10,
  bestEffort: true
}));


// ----------------------------------------------------------
// [7] Visualize
// ----------------------------------------------------------
var globalSimilarityVis = {
  min: 0.5, max: 1.0,
  palette: ['#1a237e', '#4fc3f7', '#aed581', '#ffee58', '#e65100']
};
var topRegionsVis = {min: 0.93, max: 1.0, palette: ['#ff6f00', '#b71c1c']};

Map.addLayer(
  cosine,
  globalSimilarityVis,
  'Cosine Similarity — global'
);

Map.addLayer(
  topSimilar,
  topRegionsVis,
  'Top 5% Ecologically Similar Regions'
);

Map.addLayer(
  ee.Image().paint(americanPrairie, 1, 3),
  {palette: ['#ff1744']},
  'Reference: American Prairie'
);


// ----------------------------------------------------------
// [8] Export
// ----------------------------------------------------------
Export.image.toDrive({
  image: cosine.float(),
  description: 'AmericanPrairie_EcologicalSimilarity_Global',
  folder: 'EarthEngine',
  fileNamePrefix: 'american_prairie_similarity_global',
  region: globalBounds,
  scale: 10000,
  crs: 'EPSG:4326',
  maxPixels: 1e10
});

Export.image.toDrive({
  image: topSimilar.float(),
  description: 'AmericanPrairie_Top5pct_Similar',
  folder: 'EarthEngine',
  fileNamePrefix: 'american_prairie_top5pct',
  region: globalBounds,
  scale: 10000,
  crs: 'EPSG:4326',
  maxPixels: 1e10
});
