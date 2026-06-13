import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coords, Match, Seed } from "../data/demo";
import { greatCircle } from "../util/geo";

interface Props {
  seed: Seed;
  matches: Match[];
  showSeed: boolean;
  showMatches: boolean;
  activeId: string | null;
  focus: { coords: Coords; key: number } | null;
  reducedMotion: boolean;
  onSelect: (id: string | null) => void;
  onReady?: () => void;
}

// TODO: swap for Earth Engine server-side similarity tiles (AEF-derived layers).
// For this front-end mock we use a public satellite XYZ basemap so the zoom-in
// shows real ground. Attribution required (rendered in the corner credit line).
const ESRI_WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const COLORS = {
  signal: "#4DA3FF",
  biosphere: "#46D08A",
  anomaly: "#E8C547",
};

function pinColor(status: Match["status"]) {
  return status === "CONFIRMED" ? COLORS.biosphere : COLORS.anomaly;
}

export default function MapView({
  seed,
  matches,
  showSeed,
  showMatches,
  activeId,
  focus,
  reducedMotion,
  onSelect,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const arcAnims = useRef<number[]>([]);
  const readyRef = useRef(false);

  // init map once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster",
            tiles: [ESRI_WORLD_IMAGERY],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#06080A" } },
          { id: "sat", type: "raster", source: "sat", paint: { "raster-opacity": 0.96 } },
        ],
      },
      center: [seed.coords[1], seed.coords[0]],
      zoom: 6,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      readyRef.current = true;
      onReady?.();
    });

    return () => {
      arcAnims.current.forEach(cancelAnimationFrame);
      map.remove();
      mapRef.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // build a pin DOM element
  const makePin = (color: string, label: string, onClick?: () => void) => {
    const el = document.createElement("button");
    el.className = "re-pin";
    el.style.setProperty("--pin", color);
    el.setAttribute("aria-label", label);
    el.innerHTML = `<span class="re-pin-ring"></span><span class="re-pin-dot"></span>`;
    if (onClick) el.addEventListener("click", onClick);
    return el;
  };

  // seed pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showSeed && !markers.current.__seed) {
      const el = makePin(COLORS.signal, `Seed: ${seed.name}`);
      el.classList.add("re-pin--seed", "re-pin--drop");
      const m = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([seed.coords[1], seed.coords[0]])
        .addTo(map);
      markers.current.__seed = m;
    }
    if (!showSeed && markers.current.__seed) {
      markers.current.__seed.remove();
      delete markers.current.__seed;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSeed]);

  // match pins + arcs, with a short stagger (UI.md §6 step 5)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (!showMatches) {
      matches.forEach((m) => {
        markers.current[m.id]?.remove();
        delete markers.current[m.id];
        removeArc(map, m.id);
      });
      return;
    }

    // The dissolve resolved to ground truth at the seed (close zoom). Now ease
    // back to reveal the whole retrieval network — seed + matches + arcs.
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([seed.coords[1], seed.coords[0]]);
    matches.forEach((m) => bounds.extend([m.coords[1], m.coords[0]]));
    // pad right for the dispatch panel overlay
    const fit = { padding: { top: 90, bottom: 90, left: 90, right: 500 }, maxZoom: 4 };
    if (reducedMotion) {
      map.fitBounds(bounds, { ...fit, duration: 0 });
    } else {
      window.setTimeout(
        () => mapRef.current?.fitBounds(bounds, { ...fit, duration: 2600 }),
        650
      );
    }

    matches.forEach((m, i) => {
      if (markers.current[m.id]) return;
      const delay = reducedMotion ? 0 : 650 + i * 650;
      window.setTimeout(() => {
        if (!mapRef.current) return;
        const el = makePin(pinColor(m.status), `${m.status}: ${m.name}`, () =>
          onSelect(m.id)
        );
        el.classList.add("re-pin--drop");
        el.addEventListener("mouseenter", () => onSelect(m.id));
        el.addEventListener("mouseleave", () => onSelect(null));
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([m.coords[1], m.coords[0]])
          .addTo(map);
        markers.current[m.id] = marker;
        drawArc(map, m.id, seed.coords, m.coords, reducedMotion);
      }, delay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMatches]);

  // active highlight
  useEffect(() => {
    Object.entries(markers.current).forEach(([id, m]) => {
      if (id === "__seed") return;
      m.getElement().classList.toggle("re-pin--active", id === activeId);
    });
    // dim arcs of non-active matches when something is selected
    const map = mapRef.current;
    if (!map) return;
    matches.forEach((m) => {
      const layer = `arc-${m.id}`;
      if (!map.getLayer(layer)) return;
      const op = !activeId || activeId === m.id ? 0.5 : 0.18;
      map.setPaintProperty(layer, "line-opacity", op);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // fly-to on card click
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.coords[1], focus.coords[0]],
      zoom: 8.5,
      duration: reducedMotion ? 0 : 2200,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // ── arc helpers ──────────────────────────────────────────────────────────
  function removeArc(map: maplibregl.Map, id: string) {
    if (map.getLayer(`arc-${id}`)) map.removeLayer(`arc-${id}`);
    if (map.getSource(`arc-${id}`)) map.removeSource(`arc-${id}`);
  }

  function drawArc(
    map: maplibregl.Map,
    id: string,
    a: Coords,
    b: Coords,
    reduced: boolean
  ) {
    const full = greatCircle(a, b, 96).map(([lat, lon]) => [lon, lat]);
    const srcId = `arc-${id}`;
    const layerId = `arc-${id}`;
    const feature = (coords: number[][]) => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: coords },
        },
      ],
    });

    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: "geojson", data: feature(reduced ? full : [full[0]]) });
      map.addLayer({
        id: layerId,
        type: "line",
        source: srcId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLORS.signal,
          "line-width": 1.4,
          "line-opacity": 0.5,
        },
      });
    }
    if (reduced) return;

    // animate the arc drawing on (it doesn't just appear — §10)
    const src = map.getSource(srcId) as maplibregl.GeoJSONSource;
    const start = performance.now();
    const DUR = 950;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const n = Math.max(2, Math.floor(t * full.length));
      src.setData(feature(full.slice(0, n)));
      if (t < 1) arcAnims.current.push(requestAnimationFrame(tick));
    };
    arcAnims.current.push(requestAnimationFrame(tick));
  }

  return <div ref={containerRef} className="re-map" />;
}
