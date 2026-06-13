#!/usr/bin/env python3
"""
Populate the Supabase search_cache for the 'prairie' concept by running the
live Earth Engine similarity pipeline ONCE (it takes ~4-7 min), enriching each
match with a Sentinel-2 satellite chip, and upserting the result.

After this runs, /goal?q=prairie… and /search?concept=prairie return instantly
from cache (no per-request EE compute).

Usage:
  # Real seed (writes to Supabase):
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/seed_prairie.py

  # Dry run (no Supabase creds needed) — runs EE, prints the JSON, writes
  # scripts/prairie_cache.json so you can inspect / hand-seed:
  python scripts/seed_prairie.py --dry-run

Earth Engine auth: service account via EE_SA_KEY, else local ~/.config/earthengine.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

import ee  # noqa: E402
from ee_runner import run_similarity, sentinel2_thumb_url  # noqa: E402

PROJECT = "buildday-499318"
CONCEPT = "prairie"


def init_ee():
    sa_key = os.environ.get("EE_SA_KEY")
    if sa_key:
        info = json.loads(sa_key)
        creds = ee.ServiceAccountCredentials(info["client_email"], key_data=info["private_key"])
        ee.Initialize(creds, project=PROJECT)
    else:
        ee.Initialize(project=PROJECT)


def enrich_photos(response: dict) -> None:
    """Attach a real Sentinel-2 true-color chip to each match (best-effort)."""
    for m in response.get("matches", []):
        lat, lon = m["coords"]
        url = sentinel2_thumb_url(lat, lon)
        if url:
            m["photo"] = {"url": url, "credit": "Sentinel-2 / Copernicus (2024)"}


def maybe_narrate(response: dict) -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        from narrate import generate_dispatch

        response["dispatch"] = generate_dispatch(
            CONCEPT, response["matches"], fallback=response["dispatch"]
        )
    except Exception as e:
        print(f"  (narration skipped: {e})")


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"Initializing Earth Engine (project {PROJECT})…")
    init_ee()

    print(f"Running live similarity for '{CONCEPT}' — this takes a few minutes…")
    response = run_similarity(CONCEPT)
    print(f"  → {len(response['matches'])} matches")
    for m in response["matches"]:
        print(f"    [{m['status']:9}] {m['name']}  {tuple(m['coords'])}")

    print("Fetching Sentinel-2 chips for each match…")
    enrich_photos(response)
    maybe_narrate(response)

    out_path = os.path.join(os.path.dirname(__file__), "prairie_cache.json")
    with open(out_path, "w") as f:
        json.dump(response, f, indent=2, ensure_ascii=False)
    print(f"Wrote {out_path}")

    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if dry_run or not key:
        if not key and not dry_run:
            print("\nSUPABASE_SERVICE_KEY not set — dry run only (not written to cache).")
        print("Done (dry run).")
        return

    url = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
    from supabase import create_client

    supabase = create_client(url, key)
    supabase.table("search_cache").upsert(
        {"concept": CONCEPT, "response": response}
    ).execute()
    print(f"\nSeeded '{CONCEPT}' → {len(response['matches'])} matches into search_cache.")
    print("The /goal?q=prairie… and /search?concept=prairie endpoints now hit cache.")


if __name__ == "__main__":
    main()
