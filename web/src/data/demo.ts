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

export interface Demo {
  query: string;
  seed: Seed;
  dispatch: string;
  matches: Match[];
  sources: SourceLink[];
  log: string[];
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

// Ghost suggestions hint at scope without committing to building them (§5).
export const SUGGESTIONS = ["chanterelle forests", "cold-water reefs"];
