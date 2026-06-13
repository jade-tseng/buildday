#!/usr/bin/env python3
"""Functional eval for the Earth Engine skill.

Runs ee_query.py against 8 known locations and validates JSON output fields.
Writes results to evals/results.md and evals/results.json.
Exits 0 if all tests pass, 1 otherwise.
"""
import json
import pathlib
import subprocess
import sys
from datetime import date

VENV_PYTHON = "/Users/jade/Documents/buildday/phase0/.venv/bin/python"
SCRIPT_PATH = "/Users/jade/Documents/buildday/.claude/skills/earth-engine/scripts/ee_query.py"
RESULTS_DIR = pathlib.Path("/Users/jade/Documents/buildday/.claude/skills/earth-engine/evals")

TEST_CASES = [
    {
        "location": "Monterey, California",
        "expected_geometry_types": {"Polygon"},
        "lat_range": (35.0, 37.5),
        "lon_range": (-122.5, -120.0),
        "area_range": (9000, 11000),
    },
    {
        "location": "Germany",
        "expected_geometry_types": {"Polygon", "MultiPolygon"},
        "lat_range": (47.0, 55.0),
        "lon_range": (6.0, 15.0),
        "area_range": (340000, 420000),
    },
    {
        "location": "Yosemite National Park",
        "expected_geometry_types": {"Polygon"},
        "lat_range": (37.0, 38.5),
        "lon_range": (-120.0, -118.5),
        "area_range": (2500, 4500),
    },
    {
        "location": "Texas",
        "expected_geometry_types": {"Polygon", "MultiPolygon"},
        "lat_range": (29.0, 33.0),
        "lon_range": (-107.0, -93.0),
        "area_range": (640000, 760000),
    },
    {
        "location": "Osaka, Japan",
        "expected_geometry_types": {"Polygon", "MultiPolygon"},
        "lat_range": (34.0, 35.5),
        "lon_range": (135.0, 136.0),
        "area_range": (200, 500),
    },
    {
        "location": "Death Valley National Park",
        "expected_geometry_types": {"Polygon", "MultiPolygon"},
        "lat_range": (35.0, 37.5),
        "lon_range": (-118.0, -115.0),
        "area_range": (12000, 16000),
    },
    {
        "location": "New Zealand",
        "expected_geometry_types": {"MultiPolygon"},
        "lat_range": (-47.0, -34.0),
        "lon_range": (165.0, 178.0),
        "area_range": (240000, 510000),
    },
    {
        "location": "Washington, D.C.",
        "expected_geometry_types": {"Polygon"},
        "lat_range": (38.5, 39.0),
        "lon_range": (-77.5, -76.5),
        "area_range": (100, 300),
    },
]


def run_location(location):
    try:
        proc = subprocess.run(
            [VENV_PYTHON, SCRIPT_PATH, location, "--output", "json"],
            capture_output=True,
            text=True,
            timeout=90,
        )
        if proc.returncode != 0:
            return None, f"exit code {proc.returncode}: {proc.stderr.strip()[:200]}"
        return json.loads(proc.stdout), None
    except subprocess.TimeoutExpired:
        return None, "timeout (90s)"
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}"


def validate(data, case):
    failures = []

    if "error" in data:
        return [f"top-level error: {data['error']}"]

    if not data.get("display_name"):
        failures.append("display_name missing or empty")

    gtype = data.get("geometry_type", "")
    if gtype not in case["expected_geometry_types"]:
        failures.append(
            f"geometry_type '{gtype}' not in expected {case['expected_geometry_types']}"
        )

    centroid = data.get("centroid", {})
    lat = centroid.get("lat")
    lon = centroid.get("lon")
    if lat is None or lon is None:
        failures.append("centroid missing lat/lon")
    else:
        lat_min, lat_max = case["lat_range"]
        lon_min, lon_max = case["lon_range"]
        if not (lat_min <= lat <= lat_max):
            failures.append(f"centroid lat {lat:.4f} outside [{lat_min}, {lat_max}]")
        if not (lon_min <= lon <= lon_max):
            failures.append(f"centroid lon {lon:.4f} outside [{lon_min}, {lon_max}]")

    if gtype in ("Polygon", "MultiPolygon") and "area_range" in case:
        area = data.get("area_km2")
        if area is None:
            failures.append("area_km2 missing")
        else:
            a_min, a_max = case["area_range"]
            if not (a_min <= area <= a_max):
                failures.append(f"area_km2 {area:.1f} outside [{a_min}, {a_max}]")

    bb = data.get("bounding_box", {})
    coords = bb.get("coordinates", [[]])[0] if bb else []
    if len(coords) != 5:
        failures.append(f"bounding_box ring has {len(coords)} points, expected 5")

    return failures


def generate_markdown(rows, passed, total, run_date):
    lines = [
        f"## Earth Engine Functional Eval — {run_date}",
        "",
        "| Location | Geometry | Area km² | Centroid | Status |",
        "|----------|----------|----------|----------|--------|",
    ]
    for row in rows:
        area = f"{row['area_km2']:.1f}" if row.get("area_km2") else "—"
        centroid = (
            f"{row['centroid_lat']:.4f}°, {row['centroid_lon']:.4f}°"
            if row.get("centroid_lat") is not None
            else "—"
        )
        status = "✅ PASS" if row["pass"] else "❌ FAIL"
        lines.append(
            f"| {row['location']} | {row.get('geometry_type', '—')} "
            f"| {area} | {centroid} | {status} |"
        )
        if not row["pass"]:
            for f in row["failures"]:
                lines.append(f"|  | ↳ {f} | | | |")
    lines += ["", f"**Result: {passed}/{total} passed**", ""]
    return "\n".join(lines)


def main():
    print(f"Running functional eval against {len(TEST_CASES)} locations...\n")
    rows = []
    passed = 0

    for case in TEST_CASES:
        loc = case["location"]
        print(f"  Testing: {loc} ...", end=" ", flush=True)
        data, err = run_location(loc)

        if err:
            print(f"ERROR — {err}")
            rows.append({"location": loc, "pass": False, "failures": [err]})
            continue

        failures = validate(data, case)
        ok = len(failures) == 0
        if ok:
            passed += 1
            print("PASS")
        else:
            print(f"FAIL — {'; '.join(failures)}")

        centroid = data.get("centroid", {})
        rows.append(
            {
                "location": loc,
                "pass": ok,
                "failures": failures,
                "geometry_type": data.get("geometry_type", ""),
                "area_km2": data.get("area_km2"),
                "centroid_lat": centroid.get("lat"),
                "centroid_lon": centroid.get("lon"),
                "display_name": data.get("display_name", ""),
            }
        )

    total = len(TEST_CASES)
    run_date = str(date.today())
    md = generate_markdown(rows, passed, total, run_date)

    print(f"\n{md}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "results.md").write_text(md)
    (RESULTS_DIR / "results.json").write_text(
        json.dumps({"date": run_date, "passed": passed, "total": total, "rows": rows}, indent=2)
    )
    print(f"Results written to {RESULTS_DIR}/results.md")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
