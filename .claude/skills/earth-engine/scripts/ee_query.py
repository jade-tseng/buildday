#!/usr/bin/env python3
"""Earth Engine location query tool.

Usage:
    python ee_query.py "Monterey, California"
    python ee_query.py "Monterey, California" --viz
    python ee_query.py "Yosemite National Park" --viz --output pretty
"""
import argparse
import json
import sys
import requests
import ee


EE_PROJECT = 'buildday-499318'
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def geocode(location_name):
    """Geocode a location name via Nominatim, returning GeoJSON polygon when available."""
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": location_name, "format": "json", "limit": 1, "polygon_geojson": 1},
        headers={"User-Agent": "BuildDay-EarthEngine-Skill/1.0"},
        timeout=10,
    )
    resp.raise_for_status()
    results = resp.json()
    return results[0] if results else None


def ee_geometry_from_geojson(geojson):
    """Convert a Nominatim GeoJSON geometry to an ee.Geometry."""
    gtype = geojson["type"]
    coords = geojson["coordinates"]
    if gtype == "Point":
        return ee.Geometry.Point(coords)
    if gtype == "Polygon":
        return ee.Geometry.Polygon(coords)
    if gtype == "MultiPolygon":
        return ee.Geometry.MultiPolygon(coords)
    if gtype == "LineString":
        return ee.Geometry.LineString(coords)
    # Fallback: just use centroid
    return None


def generate_map_html(ee_geom, location_name, geojson, out_path):
    """Create a folium HTML map showing the location outline."""
    import folium

    centroid = ee_geom.centroid(maxError=1).coordinates().getInfo()
    lon, lat = centroid[0], centroid[1]

    m = folium.Map(location=[lat, lon], zoom_start=10, tiles="OpenStreetMap")
    folium.GeoJson(
        geojson,
        name=location_name,
        style_function=lambda _: {
            "fillColor": "#3388ff",
            "color": "#0033cc",
            "weight": 2,
            "fillOpacity": 0.2,
        },
    ).add_to(m)
    folium.Marker([lat, lon], tooltip=location_name).add_to(m)
    folium.LayerControl().add_to(m)
    m.save(out_path)


def query_location(location_name, viz=False):
    """Main query: geocode → EE geometry → optional visualization."""
    ee.Initialize(project=EE_PROJECT)

    geocoded = geocode(location_name)
    if not geocoded:
        return {"error": f"Location not found: {location_name}"}

    lat = float(geocoded["lat"])
    lon = float(geocoded["lon"])
    display_name = geocoded.get("display_name", location_name)
    geojson = geocoded.get("geojson")

    result = {
        "location": location_name,
        "display_name": display_name,
        "coordinates": {"lat": lat, "lon": lon},
        "osm_type": geocoded.get("type", ""),
    }

    # Build EE geometry
    ee_geom = None
    if geojson:
        ee_geom = ee_geometry_from_geojson(geojson)

    if ee_geom is None:
        ee_geom = ee.Geometry.Point([lon, lat])
        result["geometry_type"] = "Point"
    else:
        result["geometry_type"] = geojson["type"]
        result["polygon_geojson"] = geojson

    # Centroid from EE
    centroid_coords = ee_geom.centroid(maxError=1).coordinates().getInfo()
    result["centroid"] = {"lon": centroid_coords[0], "lat": centroid_coords[1]}

    # Bounding box from EE
    bounds_coords = ee_geom.bounds(maxError=1).coordinates().getInfo()
    result["bounding_box"] = {
        "coordinates": bounds_coords,
        "description": "SW→NW→NE→SE corners (lon, lat)",
    }

    # Area (only meaningful for polygons)
    if result["geometry_type"] in ("Polygon", "MultiPolygon"):
        area_m2 = ee_geom.area(maxError=1).getInfo()
        result["area_km2"] = round(area_m2 / 1e6, 2)

    # Visualization
    if viz:
        slug = location_name.lower().replace(" ", "_").replace(",", "")
        html_path = f"/tmp/ee_{slug}_map.html"
        try:
            generate_map_html(ee_geom, location_name, geojson or {"type": "Point", "coordinates": [lon, lat]}, html_path)
            result["map_html"] = html_path
        except Exception as exc:
            result["viz_error"] = str(exc)

        # Also try a Sentinel-2 thumbnail via EE (mosaic so full area is covered)
        try:
            region = ee_geom.bounds(maxError=100)
            s2 = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(region)
                .filterDate("2024-06-01", "2024-09-30")
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
                .select(["B4", "B3", "B2"])
                .median()
            )
            thumb_url = s2.visualize(min=0, max=3000).getThumbURL(
                {"region": region, "dimensions": 512, "format": "png"}
            )
            img_resp = requests.get(thumb_url, timeout=30)
            if img_resp.ok:
                img_path = f"/tmp/ee_{slug}_satellite.png"
                with open(img_path, "wb") as f:
                    f.write(img_resp.content)
                result["satellite_png"] = img_path
            result["satellite_url"] = thumb_url
        except Exception as exc:
            result["satellite_error"] = str(exc)

    return result


def main():
    parser = argparse.ArgumentParser(description="Query Google Earth Engine for a location")
    parser.add_argument("location", help='Location name, e.g. "Monterey, California"')
    parser.add_argument("--viz", action="store_true", help="Generate map HTML and satellite thumbnail")
    parser.add_argument("--output", choices=["json", "pretty"], default="pretty")
    args = parser.parse_args()

    data = query_location(args.location, viz=args.viz)

    if args.output == "json":
        print(json.dumps(data, indent=2))
        return

    # Pretty output
    if "error" in data:
        print(f"Error: {data['error']}", file=sys.stderr)
        sys.exit(1)

    print(f"\n=== {data['display_name']} ===")
    c = data["coordinates"]
    print(f"Coordinates  : {c['lat']:.6f}°N, {c['lon']:.6f}°E")
    cc = data.get("centroid", {})
    if cc:
        print(f"Centroid     : {cc['lat']:.6f}°N, {cc['lon']:.6f}°E")
    print(f"Geometry type: {data.get('geometry_type', 'N/A')}")
    if "area_km2" in data:
        print(f"Area         : {data['area_km2']} km²")
    bb = data.get("bounding_box", {})
    if bb.get("coordinates"):
        coords = bb["coordinates"][0]
        sw = coords[0]
        ne = coords[2]
        print(f"Bounding box : SW ({sw[1]:.4f}°N, {sw[0]:.4f}°E) → NE ({ne[1]:.4f}°N, {ne[0]:.4f}°E)")
    if "map_html" in data:
        print(f"\nInteractive map: {data['map_html']}")
    if "satellite_png" in data:
        print(f"Satellite PNG  : {data['satellite_png']}")


if __name__ == "__main__":
    main()
