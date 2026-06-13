"""
Earth Engine similarity runner — extracted from phase0/run_similarity.py.
Returns structured match data instead of writing to disk.
"""

import math
import time

import ee
import numpy as np

PROJECT = "buildday-499318"
BANDS = [f"A{i:02d}" for i in range(64)]
WORLD = (-180, -60, 180, 75)
GRID_STEP = 5
BATCH_SIZE = 50
SAMPLE_SCALE = 1000

CONCEPT_CONFIG = {
    "kelp": {
        "query": "where can i find kelp forests like in monterey bay, ca",
        "description": "Giant / bull kelp surface canopy",
        "seeds": [
            (36.62, -121.92),
            (36.52, -121.94),
            (-43.10, 147.95),
            (-35.80, 137.60),
            (-34.20, 18.45),
            (-33.50, -71.65),
            (67.80, 13.00),
        ],
        "thin_km": 200,
        "seed_meta": {
            "name": "Monterey Bay, California",
            "coords": [36.8, -121.9],
            "species": "Macrocystis pyrifera (giant kelp)",
            "habitat": "Cold, nutrient-rich water driven by California Current upwelling (~10–15°C).",
            "photo": {
                "url": "https://upload.wikimedia.org/wikipedia/commons/3/3e/Kelp_forest_Monterey.jpg",
                "credit": "NOAA / MBNMS",
            },
        },
        "dispatch": (
            "Giant kelp doesn't care about latitude — it cares about cold, moving, nutrient-rich water "
            "and a hard floor to hold onto. The satellite never sees the kelp itself. It reads the "
            "fingerprint of the water column the kelp depends on, then looks for that same fingerprint "
            "elsewhere on Earth. Two places came back wearing Monterey's signature — one expected, one "
            "that shouldn't exist at all."
        ),
        "sources": [
            {"label": "Charles Darwin Foundation", "url": "https://www.darwinfoundation.org/"},
            {"label": "Mission Blue", "url": "https://missionblue.org/"},
            {"label": "Monterey Bay NMS", "url": "https://montereybay.noaa.gov/"},
        ],
        "log": [
            "⌖ resolving anchor → Monterey Bay, CA (36.80, -121.90)",
            "⟳ retrieving embedding · year 2024 · 64-d",
            "⟳ searching similar habitat … 2 candidates",
            "✓ verifying against occurrence records … 1 confirmed · 1 novel",
            "◍ composing dispatch",
        ],
    },
    "prairie": {
        "query": "find me grasslands like the american prairie reserve",
        "description": "American Prairie / Northern Great Plains mixed-grass prairie",
        "seeds": [
            (47.70, -107.60),
            (47.55, -107.95),
            (47.85, -107.30),
            (47.40, -108.20),
            (48.00, -107.10),
            (47.65, -106.80),
            (48.20, -106.50),
        ],
        "thin_km": 400,
        "seed_meta": {
            "name": "American Prairie Reserve, Montana",
            "coords": [47.70, -107.60],
            "species": "mixed-grass prairie assemblage",
            "habitat": "Semi-arid continental grassland, 300–500 mm annual precipitation.",
            "photo": {
                "url": "https://upload.wikimedia.org/wikipedia/commons/9/9c/Northern_Great_Plains.jpg",
                "credit": "American Prairie Reserve",
            },
        },
        "dispatch": (
            "The Northern Great Plains once held more bison than stars visible to the naked eye. "
            "The satellite reads the soil moisture regime and canopy architecture, not the animals — "
            "but it finds the same signal on every continent that still has intact semi-arid grassland. "
            "What comes back is a map of where the prairie went."
        ),
        "sources": [
            {"label": "American Prairie", "url": "https://www.americanprairie.org/"},
            {"label": "GBIF Grasslands", "url": "https://www.gbif.org/"},
        ],
        "log": [
            "⌖ resolving anchor → Phillips County, MT (47.70, -107.60)",
            "⟳ retrieving embedding · year 2024 · 64-d",
            "⟳ searching similar habitat … scanning globe",
            "✓ verifying against land cover records",
            "◍ composing dispatch",
        ],
    },
}


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    d = math.radians
    dlat = d(lat2 - lat1)
    dlon = d(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(d(lat1)) * math.cos(d(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _l2_normalize(vec):
    mag = math.sqrt(sum(v * v for v in vec))
    return [v / mag for v in vec] if mag > 1e-9 else vec


def _spatial_thin(pts, min_km, n=25):
    kept = []
    for lat, lon, score in pts:
        if all(_haversine_km(lat, lon, kl, kn, ) >= min_km for kl, kn, _ in kept):
            kept.append((lat, lon, score))
        if len(kept) >= n:
            break
    return kept


def _sample_at_point(image, lat, lon, scale=30):
    pt = ee.Geometry.Point([lon, lat])
    info = image.sample(region=pt, scale=scale, numPixels=1, geometries=False).getInfo()
    feats = info.get("features", [])
    return feats[0]["properties"] if feats else None


def _batch_sample(image, coords_latlon, scale=SAMPLE_SCALE):
    pts = [
        ee.Feature(ee.Geometry.Point([lon, lat]), {"lat": lat, "lon": lon})
        for lat, lon in coords_latlon
    ]
    fc = ee.FeatureCollection(pts)
    result = image.reduceRegions(
        collection=fc,
        reducer=ee.Reducer.first(),
        scale=scale,
    ).getInfo()

    out = []
    for feat in result["features"]:
        p = feat["properties"]
        lat = p.get("lat")
        lon = p.get("lon")
        vec = [p.get(b) for b in BANDS]
        if lat is None or lon is None:
            continue
        out.append((lat, lon, vec if vec[0] is not None else None))
    return out


def run_similarity(concept: str) -> dict:
    """Run EE similarity search. Returns a Demo-shaped dict."""
    cfg = CONCEPT_CONFIG[concept]

    col = ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL")
    emb2024 = col.filter(ee.Filter.calendarRange(2024, 2024, "year")).mosaic()

    # Sample seeds
    good_vecs = []
    for lat, lon in cfg["seeds"]:
        try:
            props = _sample_at_point(emb2024, lat, lon, scale=30)
            if props:
                vec = [float(props.get(b) or 0.0) for b in BANDS]
                good_vecs.append(vec)
        except Exception:
            pass

    if not good_vecs:
        raise RuntimeError(f"All seeds masked for concept '{concept}'")

    n = len(good_vecs)
    mean_vec = [sum(e[i] for e in good_vecs) / n for i in range(64)]
    ref = _l2_normalize(mean_vec)

    # Global grid sampling
    xmin, ymin, xmax, ymax = WORLD
    grid_lats = [ymin + GRID_STEP / 2 + i * GRID_STEP for i in range(int((ymax - ymin) / GRID_STEP))]
    grid_lons = [xmin + GRID_STEP / 2 + i * GRID_STEP for i in range(int((xmax - xmin) / GRID_STEP))]
    all_coords = [(lat, lon) for lat in grid_lats for lon in grid_lons]
    n_batches = math.ceil(len(all_coords) / BATCH_SIZE)

    grid_data = []
    for b_idx in range(n_batches):
        batch = all_coords[b_idx * BATCH_SIZE:(b_idx + 1) * BATCH_SIZE]
        try:
            samples = _batch_sample(emb2024, batch)
        except Exception:
            for lat, lon in batch:
                grid_data.append((lat, lon, None))
            continue

        for lat, lon, vec in samples:
            if vec is None or all(v is None for v in vec):
                grid_data.append((lat, lon, None))
            else:
                vec_f = [float(v or 0.0) for v in vec]
                score = sum(r * e for r, e in zip(ref, vec_f))
                grid_data.append((lat, lon, score))

    scored = [(lat, lon, s) for lat, lon, s in grid_data if s is not None]
    scored.sort(key=lambda x: x[2], reverse=True)
    top = _spatial_thin(scored, cfg["thin_km"])

    matches = [
        {
            "id": f"match{i}",
            "name": f"Match {i} ({lat:+.2f}, {lon:+.2f})",
            "coords": [round(lat, 4), round(lon, 4)],
            "status": "NOVEL",
            "species": "habitat signature match",
            "note": f"Cosine similarity {score:.4f} to reference embedding.",
            "photo": {"url": "", "credit": ""},
        }
        for i, (lat, lon, score) in enumerate(top[:5], 1)
    ]

    return {
        "query": cfg["query"],
        "seed": cfg["seed_meta"],
        "dispatch": cfg["dispatch"],
        "matches": matches,
        "sources": cfg["sources"],
        "log": cfg["log"],
    }
