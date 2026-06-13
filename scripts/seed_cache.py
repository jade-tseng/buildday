#!/usr/bin/env python3
"""
Seed the Supabase search_cache with the hardcoded kelp demo data.
Run this once before the event to ensure the demo always hits the cache.

Usage:
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=<key> python scripts/seed_cache.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from supabase import create_client

KELP_DEMO = {
    "query": "where can i find kelp forests like in monterey bay, ca",
    "seed": {
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
    "matches": [
        {
            "id": "skellig",
            "name": "Greater Skellig Coast, Ireland",
            "coords": [51.77, -10.54],
            "status": "CONFIRMED",
            "species": "Laminaria hyperborea & Laminaria digitata",
            "note": (
                "Ireland's first Mission Blue Hope Spot — ~7,000 km² from Kenmare Bay (Co. Kerry) to "
                "Loop Head (Co. Clare). Cold North Atlantic kelp the locals have cooked with for centuries. "
                "The records here are thick; this is what a confident match looks like."
            ),
            "photo": {
                "url": "https://upload.wikimedia.org/wikipedia/commons/4/47/Skellig_Michael_-_Co._Kerry%2C_Ireland.jpg",
                "credit": "Vincent Hyland / Mission Blue",
                "source": "https://missionblue.org/2023/01/greater-skellig-coast-recognized-as-irelands-first-hope-spot/",
            },
        },
        {
            "id": "galapagos",
            "name": "Galápagos — Bajo San Luis seamount",
            "coords": [-0.5, -90.3],
            "status": "NOVEL",
            "species": "deep-water kelp (Eisenia-like; sp. under study)",
            "note": (
                "Kelp in the tropics is like finding a polar bear in Miami — the Galápagos sit in a "
                "collision of warm and cold currents, the only tropics with penguins, sea lions AND kelp. "
                "A forest was found by ROV at 50–70 m in 2018, missed for decades because divers rarely go "
                "that deep. The habitat signal flagged this water before the occurrence record existed — "
                "exactly the 'novel candidate' the tool is built to surface."
            ),
            "footnote": "…confirmed by ROV survey, 2018.",
            "photo": {
                "url": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Galapagos_islands_satellite.jpg",
                "credit": "Alize Bouriat / Charles Darwin Foundation",
                "source": "https://www.darwinfoundation.org/en/news/all-news-stories/the-day-we-discovered-the-kelp-forest-in-the-galapagos/",
            },
        },
    ],
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
}


def main():
    url = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("Error: SUPABASE_SERVICE_KEY not set")
        print("Run: supabase status  to get the service_role key")
        sys.exit(1)

    supabase = create_client(url, key)

    result = supabase.table("search_cache").upsert(
        {"concept": "kelp", "response": KELP_DEMO}
    ).execute()

    print(f"Seeded 'kelp' → {len(KELP_DEMO['matches'])} matches")
    print("Done. The /search?concept=kelp endpoint will now return cached data.")


if __name__ == "__main__":
    main()
