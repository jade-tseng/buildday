// Mock data — UI.md §8. Everything after "user hits enter" is scripted from this.
// Coordinates and species are real; the verification *labels* are a deliberate
// demo choice to exercise both UI states (see note on Galápagos below).

export type Coords = [number, number]; // [lat, lon]
export type Status = "CONFIRMED" | "NOVEL";

export interface Photo {
  url: string;
  credit: string;
  source?: string;
}

export interface Match {
  id: string;
  name: string;
  coords: Coords;
  status: Status;
  species: string;
  note: string;
  /** Quiet honesty line — shown small under the card. */
  footnote?: string;
  photo: Photo;
}

export interface Seed {
  name: string;
  coords: Coords;
  species: string;
  habitat: string;
  photo: Photo;
}

export interface SourceLink {
  label: string;
  url: string;
}

// An academic paper for a match's region (from /papers → OpenAlex).
export interface Paper {
  title: string;
  authors: string;
  year: number | null;
  venue: string;
  citations: number;
  url: string;
}

export interface Demo {
  query: string;
  seed: Seed;
  dispatch: string;
  matches: Match[];
  sources: SourceLink[];
  log: string[];
}

// Fast first stage of the progressive novel-query flow (GET /resolve). Carries
// enough to center the map + drop the seed pin before the slow grid scan runs.
export interface ResolveResult {
  query: string;
  track: "novel" | "curated";
  concept: string | null;
  cache_key: string;
  seed: Seed;
  dispatch_preview: string;
  log: string[];
  cached: boolean;
}

export const DEMO: Demo = {
  query: "where can i find kelp forests like in monterey bay, ca",

  seed: {
    name: "Monterey Bay, California",
    coords: [36.8, -121.9],
    species: "Macrocystis pyrifera (giant kelp)",
    habitat:
      "Cold, nutrient-rich water driven by California Current upwelling (~10–15°C).",
    photo: {
      // public-domain / CC; verify before production
      url: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Kelp_forest_Monterey.jpg",
      credit: "NOAA / MBNMS",
    },
  },

  // Narrated answer — the serif dispatch. The planet's instrument-but-human voice.
  dispatch:
    "Giant kelp doesn't care about latitude — it cares about cold, moving, nutrient-rich water " +
    "and a hard floor to hold onto. The satellite never sees the kelp itself. It reads the " +
    "fingerprint of the water column the kelp depends on, then looks for that same fingerprint " +
    "elsewhere on Earth. Two places came back wearing Monterey's signature — one expected, one " +
    "that shouldn't exist at all.",

  matches: [
    {
      id: "skellig",
      name: "Greater Skellig Coast, Ireland",
      coords: [51.77, -10.54],
      status: "CONFIRMED", // green — dense occurrence records
      species: "Laminaria hyperborea & Laminaria digitata",
      note:
        "Ireland's first Mission Blue Hope Spot — ~7,000 km² from Kenmare Bay (Co. Kerry) to " +
        "Loop Head (Co. Clare). Cold North Atlantic kelp the locals have cooked with for centuries. " +
        "The records here are thick; this is what a confident match looks like.",
      photo: {
        // Esri/MapLibre satellite shows the ground; this image is the field reference.
        url: "https://upload.wikimedia.org/wikipedia/commons/4/47/Skellig_Michael_-_Co._Kerry%2C_Ireland.jpg",
        credit: "Vincent Hyland / Mission Blue",
        source:
          "https://missionblue.org/2023/01/greater-skellig-coast-recognized-as-irelands-first-hope-spot/",
      },
    },
    {
      id: "galapagos",
      name: "Galápagos — Bajo San Luis seamount",
      coords: [-0.5, -90.3], // approx., near Santa Cruz Island
      status: "NOVEL", // amber — flagged by signal before the records caught up
      species: "deep-water kelp (Eisenia-like; sp. under study)",
      note:
        "Kelp in the tropics is like finding a polar bear in Miami — the Galápagos sit in a " +
        "collision of warm and cold currents, the only tropics with penguins, sea lions AND kelp. " +
        "A forest was found by ROV at 50–70 m in 2018, missed for decades because divers rarely go " +
        "that deep. The habitat signal flagged this water before the occurrence record existed — " +
        "exactly the 'novel candidate' the tool is built to surface.",
      footnote: "…confirmed by ROV survey, 2018.",
      photo: {
        url: "https://upload.wikimedia.org/wikipedia/commons/e/e0/Galapagos_islands_satellite.jpg",
        credit: "Alize Bouriat / Charles Darwin Foundation",
        source:
          "https://www.darwinfoundation.org/en/news/all-news-stories/the-day-we-discovered-the-kelp-forest-in-the-galapagos/",
      },
    },
  ],

  sources: [
    { label: "Charles Darwin Foundation", url: "https://www.darwinfoundation.org/" },
    { label: "Mission Blue", url: "https://missionblue.org/" },
    { label: "Monterey Bay NMS", url: "https://montereybay.noaa.gov/" },
  ],

  // status log lines for the query bar (§5), played with ~600ms stagger
  log: [
    "⌖ resolving anchor → Monterey Bay, CA (36.80, -121.90)",
    "⟳ retrieving embedding · year 2024 · 64-d",
    "⟳ searching similar habitat … 2 candidates",
    "✓ verifying against occurrence records … 1 confirmed · 1 novel",
    "◍ composing dispatch",
  ],
};

// Offline fallback for the prairie path — mirrors the live /goal?q=prairie…
// response (real phase0/REPORT.md matches & cosine scores) so the demo still
// runs if the API/cache is unavailable. Match photos are left empty (the map
// fly-to shows real satellite ground); the cached API response carries live
// Sentinel-2 chips.
export const PRAIRIE_DEMO: Demo = {
  query: "prairie like in montana — brown dry grassland/rangeland",
  seed: {
    name: "American Prairie Reserve, Montana",
    coords: [47.7, -107.6],
    species: "mixed-grass prairie assemblage",
    habitat: "Semi-arid continental grassland, 300–500 mm annual precipitation.",
    photo: {
      url: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Northern_Great_Plains.jpg",
      credit: "American Prairie Reserve",
    },
  },
  dispatch:
    "The Northern Great Plains once held more bison than stars visible to the naked eye. " +
    "The satellite reads the soil moisture regime and canopy architecture, not the animals — " +
    "but it finds the same signal on every continent that still has intact semi-arid grassland. " +
    "What comes back is a map of where the prairie went.",
  matches: [
    {
      id: "montana",
      name: "Montana — near Great Falls",
      coords: [47.5, -112.5],
      status: "CONFIRMED",
      species: "northern mixed-grass prairie",
      note:
        "Rolling dry grassland and rangeland cut by river drainages — brown grass, the home " +
        "biome itself, 500 km from the seed. · cosine 0.8955",
      photo: { url: "", credit: "" },
    },
    {
      id: "kazakhstan-east",
      name: "Eastern Kazakhstan / Xinjiang border",
      coords: [47.5, 82.5],
      status: "NOVEL",
      species: "semi-arid montane grassland",
      note:
        "Scores high but the chip shows rocky, snow-dusted terrain — more arid mountain than " +
        "open steppe. A flagged near-relative. · cosine 0.8522",
      photo: { url: "", credit: "" },
    },
    {
      id: "dakota",
      name: "North / South Dakota — Lake Oahe",
      coords: [47.5, -102.5],
      status: "CONFIRMED",
      species: "mixed-grass prairie (cultivated)",
      note:
        "Checkerboard dryland agriculture on former prairie, threaded by a great Missouri " +
        "reservoir. The grassland signal survives the plough. · cosine 0.7770",
      photo: { url: "", credit: "" },
    },
    {
      id: "kyrgyzstan",
      name: "Kyrgyzstan / Kazakhstan foothills",
      coords: [42.5, 72.5],
      status: "NOVEL",
      species: "mountain-steppe transition",
      note:
        "An eroded river valley in rugged country — the grassland signal blurred into the Tien " +
        "Shan's edge. Plausible, not pure. · cosine 0.7190",
      photo: { url: "", credit: "" },
    },
    {
      id: "kazakhstan-central",
      name: "Central Kazakhstan steppe",
      coords: [47.5, 72.5],
      status: "CONFIRMED",
      species: "Kazakh steppe",
      note:
        "Flat, monotone, semi-arid brown grassland half a world away — the same mid-latitude " +
        "temperate steppe, wearing Montana's signature. · cosine 0.7190",
      photo: { url: "", credit: "" },
    },
    {
      id: "great-basin",
      name: "Oregon / Nevada — Great Basin",
      coords: [42.5, -117.5],
      status: "NOVEL",
      species: "sagebrush shrubsteppe",
      note:
        "Reddish-brown high desert with drainage channels — sagebrush country adjacent to the " +
        "prairie biome, not grassland proper. · cosine 0.7062",
      photo: { url: "", credit: "" },
    },
  ],
  sources: [
    { label: "American Prairie", url: "https://www.americanprairie.org/" },
    { label: "GBIF Grasslands", url: "https://www.gbif.org/" },
  ],
  log: [
    "⌖ resolving anchor → Phillips County, MT (47.70, -107.60)",
    "⟳ retrieving embedding · year 2024 · 64-d",
    "⟳ searching similar habitat … scanning globe",
    "✓ verifying against land cover records",
    "◍ composing dispatch",
  ],
};

// Mirror of the backend keyword resolver (api/main.py resolve_concept) so the
// UI can validate input and pick the right offline fallback.
export type Concept = "prairie" | "kelp";

export function detectConcept(query: string): Concept | null {
  const q = query.toLowerCase();
  if (/prairie|grassland|rangeland|steppe|montana|plains|savanna/.test(q)) return "prairie";
  if (/kelp|monterey|reef|coast|seaweed|ocean/.test(q)) return "kelp";
  return null;
}

export function pickMock(query: string): Demo {
  return detectConcept(query) === "prairie" ? PRAIRIE_DEMO : DEMO;
}

// Ghost suggestions hint at scope without committing to building them (§5).
export const SUGGESTIONS = ["chanterelle forests"];

// One-click working suggestion for the prairie /goal path.
export const PRAIRIE_SUGGESTION = "prairie like in Montana — brown dry grassland/rangeland";
