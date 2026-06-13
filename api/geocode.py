"""Nominatim geocoding for the novel-query track.

Adapted from .claude/skills/earth-engine/scripts/ee_query.py so it's importable
from the API package without the skill. Nominatim REQUIRES a descriptive
User-Agent (it blocks the default python-requests UA) and rate-limits to ~1 req/s
— we geocode at most once per novel query, and the whole result is cached.
"""

import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim usage policy: identify the app + a contact address.
USER_AGENT = "RewildingEarth/1.0 (jadeyutseng@gmail.com)"


def geocode(location_name: str) -> dict | None:
    """Geocode a place name via Nominatim.

    Returns the raw top result dict ({'lat', 'lon', 'display_name', 'geojson'…})
    or None on empty result / any failure (caller degrades gracefully).
    """
    if not location_name or not location_name.strip():
        return None
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": location_name, "format": "json", "limit": 1, "polygon_geojson": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json()
        return results[0] if results else None
    except Exception:
        return None


def geocode_point(location_name: str) -> tuple[float, float, str] | None:
    """Convenience: (lat, lon, display_name) for the seed sampler, or None."""
    result = geocode(location_name)
    if not result:
        return None
    try:
        return float(result["lat"]), float(result["lon"]), result.get("display_name", location_name)
    except (KeyError, ValueError, TypeError):
        return None
