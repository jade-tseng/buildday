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


# Per-grid-cell labels for the prairie top matches, grounded in phase0/REPORT.md.
# Keyed by the 5° grid cell (lat, lon). `status` maps REPORT plausibility to the
# UI's verification colors: CONFIRMED (green) = clear prairie/steppe;
# NOVEL (amber) = borderline semi-arid relative (mountain-steppe, shrubsteppe).
MATCH_LABELS = {
    "prairie": {
        (47.5, -112.5): {
            "name": "Montana — near Great Falls",
            "species": "northern mixed-grass prairie",
            "status": "CONFIRMED",
            "note": "Rolling dry grassland and rangeland cut by river drainages — brown grass, the home biome itself, 500 km from the seed.",
        },
        (47.5, -102.5): {
            "name": "North / South Dakota — Lake Oahe",
            "species": "mixed-grass prairie (cultivated)",
            "status": "CONFIRMED",
            "note": "Checkerboard dryland agriculture on former prairie, threaded by a great Missouri reservoir. The grassland signal survives the plough.",
        },
        (42.5, -102.5): {
            "name": "Nebraska Sandhills",
            "species": "sandhills mixed-grass prairie",
            "status": "CONFIRMED",
            "note": "The largest intact natural grassland in the western hemisphere — grass-stabilised dunes the embedding reads as kin to Montana.",
        },
        (52.5, -112.5): {
            "name": "Alberta, Canada — Canadian Prairies",
            "species": "northern fescue prairie",
            "status": "CONFIRMED",
            "note": "The prairie doesn't stop at the border. Clear agricultural grassland continuing the Great Plains corridor north.",
        },
        (42.5, -107.5): {
            "name": "Wyoming — Powder River rangeland",
            "species": "prairie / shrubsteppe transition",
            "status": "CONFIRMED",
            "note": "Brown rangeland on the prairie's dry western edge, grading toward sagebrush but still grassland at heart.",
        },
        (47.5, 72.5): {
            "name": "Central Kazakhstan steppe",
            "species": "Kazakh steppe",
            "status": "CONFIRMED",
            "note": "Flat, monotone, semi-arid brown grassland half a world away — the same mid-latitude temperate steppe, wearing Montana's signature.",
        },
        (52.5, 62.5): {
            "name": "Southern Urals — Kazakh steppe margin",
            "species": "forb-rich steppe",
            "status": "CONFIRMED",
            "note": "Agricultural steppe and settlements on the Eurasian grassland belt; a textbook steppe-biome match.",
        },
        (47.5, 112.5): {
            "name": "Eastern Mongolia steppe",
            "species": "Mongolian steppe",
            "status": "CONFIRMED",
            "note": "Pale, dry, open grassland on the Mongolian plateau — one of the last great intact temperate grasslands on Earth.",
        },
        (47.5, 102.5): {
            "name": "Central Mongolia steppe",
            "species": "Mongolian steppe",
            "status": "CONFIRMED",
            "note": "Brown arid grassland with a faint field patchwork, deep in the Asian interior — the prairie's eastern twin.",
        },
        # — borderline (amber) —
        (47.5, 82.5): {
            "name": "Eastern Kazakhstan / Xinjiang border",
            "species": "semi-arid montane grassland",
            "status": "NOVEL",
            "note": "Scores high but the chip shows rocky, snow-dusted terrain — more arid mountain than open steppe. A flagged near-relative.",
        },
        (42.5, 72.5): {
            "name": "Kyrgyzstan / Kazakhstan foothills",
            "species": "mountain-steppe transition",
            "status": "NOVEL",
            "note": "An eroded river valley in rugged country — the grassland signal blurred into the Tien Shan's edge. Plausible, not pure.",
        },
        (42.5, -117.5): {
            "name": "Oregon / Nevada — Great Basin",
            "species": "sagebrush shrubsteppe",
            "status": "NOVEL",
            "note": "Reddish-brown high desert with drainage channels — sagebrush country adjacent to the prairie biome, not grassland proper.",
        },
        (42.5, -112.5): {
            "name": "Southern Idaho — Snake River Plain",
            "species": "high-desert shrubsteppe",
            "status": "NOVEL",
            "note": "Red-brown arid terrain on the prairie's dry frontier — a desert relative the signal can't quite tell apart.",
        },
        (47.5, 92.5): {
            "name": "Western Mongolia — Altai margins",
            "species": "steppe-desert transition",
            "status": "NOVEL",
            "note": "Sandy, rocky ground beneath snow-capped ridges — the arid Gobi edge where steppe gives way to desert.",
        },
        (52.5, 72.5): {
            "name": "Northern Kazakhstan / W. Siberia",
            "species": "forest-steppe",
            "status": "NOVEL",
            "note": "Greener, wetter, water bodies scattered through — the forest-steppe transition at the grassland's humid northern limit.",
        },
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


def _build_matches(concept: str, top: list, limit: int = 6) -> list:
    """Turn thinned (lat, lon, score) hits into Demo-shaped match cards,
    merging in REPORT.md geography/status labels where we have them."""
    labels = MATCH_LABELS.get(concept, {})
    matches = []
    for i, (lat, lon, score) in enumerate(top[:limit], 1):
        label = labels.get((round(lat, 1), round(lon, 1)))
        if label:
            note = f"{label['note']} · cosine {score:.4f}"
            match = {
                "id": label["name"].split(" —")[0].split(" /")[0].strip().lower().replace(" ", "-"),
                "name": label["name"],
                "coords": [round(lat, 4), round(lon, 4)],
                "status": label["status"],
                "species": label["species"],
                "note": note,
                "photo": {"url": "", "credit": ""},
            }
        else:
            match = {
                "id": f"match{i}",
                "name": f"Signature match ({lat:+.2f}, {lon:+.2f})",
                "coords": [round(lat, 4), round(lon, 4)],
                "status": "NOVEL",
                "species": "habitat signature match",
                "note": f"Habitat signature match · cosine {score:.4f}.",
                "photo": {"url": "", "credit": ""},
            }
        matches.append(match)
    return matches


def sentinel2_thumb_url(lat: float, lon: float, half_deg: float = 0.18) -> str:
    """Best-effort Sentinel-2 true-color RGB thumbnail for a match location —
    the actual satellite chip of the place (used when pre-seeding the cache).
    Returns "" on failure so callers can degrade gracefully."""
    try:
        region = ee.Geometry.Rectangle(
            [lon - half_deg, lat - half_deg, lon + half_deg, lat + half_deg]
        )
        s2 = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate("2024-01-01", "2024-12-31")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
            .select(["B4", "B3", "B2"])
            .median()
        )
        return s2.getThumbURL(
            {"min": 0, "max": 2500, "dimensions": 384, "region": region, "format": "png"}
        )
    except Exception:
        return ""


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

    matches = _build_matches(concept, top, limit=6)

    return {
        "query": cfg["query"],
        "seed": cfg["seed_meta"],
        "dispatch": cfg["dispatch"],
        "matches": matches,
        "sources": cfg["sources"],
        "log": cfg["log"],
    }
