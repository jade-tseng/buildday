---
name: earth-engine
description: Use this skill whenever the user asks about geographic locations, coordinates, bounding boxes, polygons, satellite imagery, land cover, or anything that can be answered with Google Earth Engine. Trigger on phrases like "give me the coordinates of X", "show me a polygon of X", "get the bounding box for X", "satellite image of X", "what does X look like from space", "area of X", "where is X", or any question involving a named place and spatial data. Always use this skill for Earth Engine queries even if the user doesn't say "Earth Engine" explicitly.
---

# Google Earth Engine Skill

Answers geographic and spatial questions using the Google Earth Engine Python API.

## What this skill can do

- **Coordinates**: centroid lat/lon for any named location
- **Polygon / boundary**: GeoJSON geometry for cities, counties, states, countries, parks
- **Bounding box**: SW/NE corners bounding the location
- **Area**: computed area in km² for polygon features
- **Interactive map**: folium HTML map with the location outline
- **Satellite imagery**: Sentinel-2 true-color thumbnail PNG

## How to use

The skill runs `ee_query.py` via the project virtual environment. Always use the full path to the venv Python binary.

```
VENV=phase0/.venv/bin/python
SCRIPT=.claude/skills/earth-engine/scripts/ee_query.py
```

### Coordinates only (fast, no viz)
```bash
phase0/.venv/bin/python .claude/skills/earth-engine/scripts/ee_query.py "Monterey, California"
```

### Coordinates + interactive map + satellite image
```bash
phase0/.venv/bin/python .claude/skills/earth-engine/scripts/ee_query.py "Yosemite National Park" --viz
```

### Machine-readable JSON
```bash
phase0/.venv/bin/python .claude/skills/earth-engine/scripts/ee_query.py "Monterey, California" --output json
```

## Output fields (JSON)

| Field | Description |
|-------|-------------|
| `display_name` | Full human-readable place name |
| `coordinates` | `{lat, lon}` — geocoded point |
| `centroid` | `{lat, lon}` — EE-computed centroid of polygon |
| `geometry_type` | `Point`, `Polygon`, or `MultiPolygon` |
| `polygon_geojson` | Raw GeoJSON geometry (if polygon available) |
| `bounding_box` | EE bounds polygon coordinates |
| `area_km2` | Area in km² (polygon features only) |
| `map_html` | Path to generated folium HTML map (with `--viz`) |
| `satellite_png` | Path to Sentinel-2 thumbnail PNG (with `--viz`) |

## Environment

- **EE project**: `buildday-499318`
- **Authentication**: credentials stored at `~/.config/earthengine/`
- **Python env**: `phase0/.venv/`
- **Geocoding**: Nominatim (OpenStreetMap) — no API key needed
- **Imagery**: Sentinel-2 SR Harmonized, 2024 summer, least cloudy scene

## Workflow

1. Run the script with the location name from the user's request.
2. Parse the output (pretty or JSON).
3. Report coordinates, bounding box, and area to the user.
4. If `--viz` was used, tell the user the map HTML path so they can open it in a browser, and show the satellite PNG path.
5. If the location is ambiguous (e.g. "Springfield"), ask the user to clarify state/country, then re-run.

## Error handling

- `"error": "Location not found"` → location name too ambiguous; ask user to be more specific
- `"satellite_error"` → EE imagery unavailable for that region or date range; ignore and report other fields
- EE `EEException` on init → credentials may have expired; tell user to run `earthengine authenticate`
