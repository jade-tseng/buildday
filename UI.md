# UI.md — Rewilding Earth, frontend build spec

---

## 0. What we're building (context)

A "search the Earth" interface. A user asks a place in plain language — *"where can I find kelp
forests like in Monterey Bay, CA"* — and the tool pins the place on a globe, searches for
ecologically similar places, and returns matches verified against real species records, with a
short narrated answer. The engine is nearest-neighbor retrieval over AlphaEarth satellite
embeddings; the product magic is that the satellite can't see the kelp — it recognizes the *ocean
the kelp needs*. The UI has to make that feeling legible.

For this build, everything after "user hits enter" is **scripted from mock data**. We are building
the look, the motion, and one fully-working demo path.

---

## 1. Design thesis (read this — it's the whole point)

The reference frame is **planetary computation** (Bratton / Antikythera). The one idea to encode:
the Earth has grown a sensing skin of satellites and sensors and is using it to perceive and model
*itself*. The black-hole image was taken by linking telescopes across the planet and letting the
Earth's own rotation turn the lens — the planet sensed its own surroundings. Our interface is a
small instrument plugged into that same apparatus. It should feel less like Google Maps and more
like a terminal on the side of a living planetary nervous system: instrument-grade, quiet, a little
uncanny, allocentric — the view from outside ourselves.

Two material registers carry this, and they map onto a real distinction in the science:

- **The technosphere register** — monospace glyphs, hairline grids, coordinates, readouts. This is
  the apparatus talking. Cold, precise, blue.
- **The biosphere register** — the actual living matches: warm satellite imagery, real photographs,
  a narration voice that reads like a field dispatch. This is what the apparatus *found*. Green.

**The signature move that fuses them:** the globe is rendered as **ASCII** — the planet literally
spelled out in data characters — and when the user zooms to a pinned location, those characters
**resolve into real satellite imagery**. Glyph becomes ground truth. The abstraction collapsing into
the real *is* the thesis (the sim-to-real gap, made into an interaction). Spend your boldness here;
keep everything else disciplined around it.

---

## 2. Token system

Tight palette per brief — black, dark grey, white, blue, green — formalized:

```
COLOR
--void        #06080A   /* page background — near-black, faint blue cast */
--panel       #0E1317   /* raised panels, query bar, cards */
--panel-2     #131A1F   /* hover / nested surfaces */
--grid        #1E272D   /* hairlines, 1px dividers, globe graticule */
--bone        #E9EDEA   /* primary text (off-white, never pure #FFF) */
--bone-dim    #8A9590   /* secondary text, captions, coordinates */
--signal      #4DA3FF   /* the apparatus: UI chrome, seed pin, scanning, links */
--signal-deep #1F4E8C   /* signal, pressed/!active */
--biosphere   #46D08A   /* life / CONFIRMED occurrence / the green register */
--anomaly     #E8C547   /* NOVEL candidate (similar habitat, no records) — a warm amber  */
```

Semantics are load-bearing, not decoration: **blue = the machine sensing**, **green = confirmed
life**, **amber = an anomaly the machine flagged that the records can't yet vouch for.** A pin's
color tells you its verification state at a glance.

```
TYPE   (all Google Fonts, free)
Display / labels / UI   "Space Grotesk"      — slightly mechanical grotesque, set in caps for
                                               eyebrows and labels with +0.08em tracking
Data / ASCII / coords   "IBM Plex Mono"      — the instrument voice; the globe is built from this
Narration prose         "Newsreader"         — a literary serif; the planet's "dispatch" voice,
                                               18–20px, generous line-height (1.6), max ~62ch
```

The serif for narration is the deliberate risk: the answer the planet gives back reads like a
field journal, not a tooltip. It's the warmest thing on a cold screen, and that contrast is the
point.

```
LAYOUT
- 8px spacing base. Zero or 2px border-radius only — this is instrumentation, not a SaaS card.
- Hairline (1px --grid) dividers everywhere; no drop shadows. Depth comes from surface value, not blur.
- One ambient texture allowed: a very faint (2–3% opacity) graticule/grid over --void.
- Respect prefers-reduced-motion. Keyboard focus always visible (1px --signal outline).
```

---

## 3. Screen anatomy

Single full-bleed screen, two states (globe → result), no page reloads.

```
┌──────────────────────────────────────────────────────────────────────┐
│  REWILDING EARTH                                  [ ◷ live ]  ʟᴀᴛ/ʟᴏɴ  │  ← thin top bar, mono
│                                                                        │
│                                                                        │
│                        . : ░ ▒ ▓ █ ▓ ▒ ░ : .                          │
│                     : ▒ ▓ █ █ █ █ █ █ █ ▓ ▒ :                         │
│                   ░ ▓ █ █ █ █ █ █ █ █ █ █ ▓ ░                        │  ← THE SIGNATURE:
│                   ▒ █ █ █ █ █ █ █ █ █ █ █ █ ▒                        │     rotating ASCII globe
│                   ░ ▓ █ █ █ █ █ █ █ █ █ █ ▓ ░                        │     (section 4)
│                     : ▒ ▓ █ █ █ █ █ █ █ ▓ ▒ :                         │
│                        ' : ░ ▒ ▓ █ ▓ ▒ ░ : '                          │
│                                                                        │
│        ┌──────────────────────────────────────────────────┐          │
│        │ ⌖  where can i find kelp forests like monterey…   │  →       │  ← query bar (section 5)
│        └──────────────────────────────────────────────────┘          │
│              try: chanterelle forests · cold-water reefs               │  ← ghost suggestions
└──────────────────────────────────────────────────────────────────────┘
```

After search, the globe stays as the spatial anchor (left/center) and a **dispatch panel** slides
in from the right with the narrated answer + match cards. On mobile, globe on top, dispatch below.

```
RESULT STATE (desktop)
┌───────────────────────────────┬──────────────────────────────────────┐
│                               │  SEED  Monterey Bay, CA   36.80,-121.90│
│      [ globe, now zoomed,     │  ────────────────────────────────────  │
│        seed + 2 match pins,   │  ◍ dispatch (Newsreader serif prose)   │
│        great-circle arcs ]    │  "Giant kelp needs cold, upwelling…"   │
│                               │                                        │
│                               │  ┌── CONFIRMED ──────────────────────┐ │
│                               │  │ Greater Skellig Coast, Ireland    │ │
│                               │  │ [photo]  Laminaria hyperborea     │ │
│                               │  └───────────────────────────────────┘ │
│                               │  ┌── NOVEL CANDIDATE ────────────────┐ │
│                               │  │ Galápagos (Bajo San Luis)         │ │
│                               │  │ [photo]  flagged before logged    │ │
│                               │  └───────────────────────────────────┘ │
│                               │  sources: CDF · Mission Blue · MBNMS   │
└───────────────────────────────┴──────────────────────────────────────┘
```

---

## 4. The signature: ASCII globe → satellite

This is the one element the product is remembered by. Build it carefully.

**Idle state — rotating ASCII Earth.** A sphere rendered in a monospace character grid. Map each
screen cell to a lat/long via an orthographic projection, sample a coarse land/ocean bitmap (a small
equirectangular mask is fine — even 360×180), and pick a glyph by "is this land + how lit is it":
ocean → ` . : ░`, land → `▒ ▓ █`, with a terminator gradient so one limb fades to dark. Rotate the
longitude offset ~6°/sec. Characters in `--bone-dim` over `--void`, a faint `--signal` rim-light on
the leading edge. It should read as a planet *and* as a readout at the same time — that duality is
deliberate.

- Keep it GPU-cheap: it's a `<canvas>` or a `<pre>` re-rendered on `requestAnimationFrame`, ~30–40
  cols wide is plenty. Don't import three.js just for this unless you already have it for the map.
- A faint graticule and a slowly ticking coordinate readout in the corner sell "instrument."

**Transition — glyph resolves to ground.** On search, the camera "flies" to the seed longitude
(spin the globe so the pin rotates to face front, ~1.2s ease), then the ASCII **dissolves into a
real satellite slippy-map** centered on the seed. Don't hard-cut. Two acceptable techniques:

1. *Character bloom*: ASCII cells fade out in a radial wipe from the pin while a MapLibre satellite
   layer fades in underneath at matching zoom. Glyphs "burn off" to reveal the photograph.
2. *Resolution ramp*: scale the char grid down (cells shrink toward 1px) as the raster fades up, so
   it reads as the image "resolving" out of low-res symbols.

Either way the felt story is: **abstraction → ground truth.** Reverse it on "back to globe."

**Zoomed state — real satellite map.** Use MapLibre GL with a satellite raster basemap (section 7).
Seed pin in `--signal`, match pins colored by verification state, thin animated great-circle arcs
from seed → each match drawn in `--signal` at 30% opacity. Clicking a pin scrolls its dispatch card
into view and vice-versa.

---

## 5. Query bar

The only required input. Centered in idle state, docks to top after first search.

- Monospace placeholder, a `⌖` reticle glyph as the leading icon, a `→` submit affordance.
- On focus: 1px `--signal` border, subtle inner glow. On submit: the icon becomes a small spinner
  and the bar emits a one-line **status log** above it that types out the pipeline as it runs (this
  is where you narrate the engine without a backend):

  ```
  ⌖ resolving anchor → Monterey Bay, CA (36.80, -121.90)
  ⟳ retrieving embedding · year 2024 · 64-d
  ⟳ searching similar habitat … 2 candidates
  ✓ verifying against occurrence records … 1 confirmed · 1 novel
  ◍ composing dispatch
  ```

  Stagger these ~500–700ms apart from the mock data so it feels like work is happening. This log is
  doing real product work: it teaches the user that retrieval and verification are *separate steps*,
  which is the trust story.

- Ghost suggestions under the bar (`chanterelle forests`, `cold-water reefs`) hint at scope without
  committing to building them — only the kelp path needs to fully work.

---

## 6. The scripted demo (the one path that must work end-to-end)

Exact sequence to implement against the mock data:

1. Load → rotating ASCII globe, query bar centered, ghost suggestions.
2. User types (or clicks suggestion) **"where can i find kelp forests like in monterey bay, ca"** →
   Enter.
3. Globe spins so Monterey faces front; **seed pin drops** at `36.80, -121.90` in `--signal`; status
   log types out (section 5).
4. ASCII **dissolves into satellite imagery** at the seed (section 4 transition).
5. Two match pins drop with a short stagger — **Skellig (green, CONFIRMED)** then **Galápagos
   (amber, NOVEL CANDIDATE)** — great-circle arcs draw from Monterey to each.
6. Dispatch panel slides in: the narrated answer (Newsreader serif) types/fades in, followed by the
   two match cards, then the sources line.
7. Hovering/clicking a pin highlights its card; clicking a card flies the map to that location and
   swaps in its satellite tile + photo.
8. "↺ back to globe" returns to the idle rotating ASCII state.

Everything in steps 3–6 is read from the mock object below. No network calls except map/photo
tiles.

---

## 7. Satellite imagery & map tiles (real, for the zoomed state)

The brief points at Google Earth Engine datasets — that's the *production* source for the engine.
For this **front-end mock**, don't wire up Earth Engine auth; use a public satellite XYZ basemap so
the zoom-in shows real ground:

- **Esri World Imagery** (simple, widely used):
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
  Attribution required: *"Esri, Maxar, Earthstar Geographics"* — put it in a corner credit line.
- Alternative: **NASA GIBS** (`MODIS_Terra_CorrectedReflectance_TrueColor`) for a more "planetary
  sensing" daily-imagery feel, or Sentinel-2 cloudless tiles if you have a key.

Leave a clearly marked `// TODO: swap for Earth Engine server-side similarity tiles` seam where the
basemap is configured, so the engine team can drop in real AEF-derived layers later.

---

## 8. Mock data

Drop this in as a single module. Coordinates and species are real; the verification *labels* are a
deliberate demo choice (see note) to exercise both UI states.

```js
export const DEMO = {
  query: "where can i find kelp forests like in monterey bay, ca",

  seed: {
    name: "Monterey Bay, California",
    coords: [36.80, -121.90],
    species: "Macrocystis pyrifera (giant kelp)",
    habitat: "Cold, nutrient-rich water driven by California Current upwelling (~10–15°C).",
    photo: { // public-domain / CC; verify before production
      url: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Kelp_forest_Monterey.jpg",
      credit: "NOAA / MBNMS"
    }
  },

  // Narrated answer — the serif dispatch. Written in the planet's instrument-but-human voice.
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
      status: "CONFIRMED",                 // green — dense occurrence records
      species: "Laminaria hyperborea & Laminaria digitata",
      note:
        "Ireland's first Mission Blue Hope Spot — ~7,000 km² from Kenmare Bay (Co. Kerry) to " +
        "Loop Head (Co. Clare). Cold North Atlantic kelp the locals have cooked with for centuries. " +
        "The records here are thick; this is what a confident match looks like.",
      photo: {
        url: "https://missionblue.org/.../skellig-coast.jpg", // grab attributed image from source
        credit: "Vincent Hyland / Mission Blue",
        source: "https://missionblue.org/2023/01/greater-skellig-coast-recognized-as-irelands-first-hope-spot/"
      }
    },
    {
      id: "galapagos",
      name: "Galápagos — Bajo San Luis seamount",
      coords: [-0.50, -90.30],             // approx., near Santa Cruz Island
      status: "NOVEL",                     // amber — flagged by signal before the records caught up
      species: "deep-water kelp (Eisenia-like; sp. under study)",
      note:
        "Kelp in the tropics is like finding a polar bear in Miami — the Galápagos sit in a " +
        "collision of warm and cold currents, the only tropics with penguins, sea lions AND kelp. " +
        "A forest was found by ROV at 50–70 m in 2018, missed for decades because divers rarely go " +
        "that deep. The habitat signal flagged this water before the occurrence record existed — " +
        "exactly the 'novel candidate' the tool is built to surface.",
      photo: {
        url: "https://www.darwinfoundation.org/media/images/Subtitulo.max-1000x1000.jpg",
        credit: "Alize Bouriat / Charles Darwin Foundation",
        source: "https://www.darwinfoundation.org/en/news/all-news-stories/the-day-we-discovered-the-kelp-forest-in-the-galapagos/"
      }
    }
  ],

  sources: [
    { label: "Charles Darwin Foundation", url: "https://www.darwinfoundation.org/" },
    { label: "Mission Blue", url: "https://missionblue.org/" },
    { label: "Monterey Bay NMS", url: "https://montereybay.noaa.gov/" }
  ],

  // status log lines for the query bar (section 5), played with ~600ms stagger
  log: [
    "⌖ resolving anchor → Monterey Bay, CA (36.80, -121.90)",
    "⟳ retrieving embedding · year 2024 · 64-d",
    "⟳ searching similar habitat … 2 candidates",
    "✓ verifying against occurrence records … 1 confirmed · 1 novel",
    "◍ composing dispatch"
  ]
};
```

**Note on the demo labels:** in the real engine, Galápagos kelp *is* now confirmed (2018 ROV
discovery). We render it as a **NOVEL candidate** here so the demo shows both verification states
and tells the magic story — the apparatus seeing the habitat before the records do. Add one quiet
line in the Galápagos card ("…confirmed by ROV survey, 2018") so we're honest, not misleading.

**Images:** the photo URLs above are starting points — pull the actual attributed image off each
source page and keep the credit line visible on every card (it doubles as the product's "cite a
source or two" promise). Confirm licensing before any non-POC use; for the internal demo, attributed
use is fine.

---

## 9. Tech stack

- **Framework:** React + Vite, single page. TypeScript if quick.
- **Map:** MapLibre GL JS with the raster satellite source in section 7. (deck.gl optional for the
  great-circle arcs — `ArcLayer` is clean — but plain MapLibre + an animated GeoJSON line is enough.)
- **ASCII globe:** hand-rolled `<canvas>` or `<pre>` on `requestAnimationFrame`. No heavy dep.
- **Fonts:** Space Grotesk, IBM Plex Mono, Newsreader via Google Fonts.
- **State:** plain React state / a tiny store. Everything is driven by the `DEMO` object.
- **No backend, no auth, no localStorage** (keep state in memory).

---

## 10. Motion & detail

- One orchestrated page-load: globe fades up + begins rotating, query bar rises, suggestions fade in
  last. After that, motion is reactive only (search, hover, fly-to). Resist ambient animation
  everywhere else — restraint reads as instrument-grade.
- The ASCII→satellite dissolve is the hero moment; give it real time (≥1s) and ease it.
- Great-circle arcs draw on, they don't just appear. Pins drop with a 2px settle.
- Reduced-motion: skip the dissolve (cross-fade instead), no globe spin, arcs appear statically.

---

## 11. Voice & copy

Interface chrome in **Space Grotesk caps**, terse and active: `SEED`, `CONFIRMED`, `NOVEL CANDIDATE`,
`↺ BACK TO GLOBE`. Coordinates and logs in **mono**. The dispatch and card notes in **serif**, written
as if the planet is reporting a finding — plain, specific, a little awe, no marketing. Empty/error
states stay in character: a failed search reads `⌖ no anchor found — try a place or a species`, not
an apology. Never name the system's plumbing to the user ("embedding," "k-NN") *in the result copy* —
that vocabulary belongs only in the deliberately-exposed status log, where it builds trust.

---

## 12. Definition of done

- [ ] Rotating ASCII globe on load; reads as both a planet and a readout.
- [ ] Query bar accepts the scripted query (typed or via suggestion) and runs the staggered log.
- [ ] Seed pin drops at Monterey; globe orients to it.
- [ ] ASCII **dissolves into real satellite imagery** at the seed (the hero transition).
- [ ] Two match pins drop, color-coded by status (green CONFIRMED / amber NOVEL), with arcs.
- [ ] Dispatch panel: serif narration + two photo cards with species, note, credit; sources line.
- [ ] Pin ↔ card interaction (hover highlight, click fly-to).
- [ ] "Back to globe" returns to idle state.
- [ ] Dark throughout; palette and type tokens from section 2 applied exactly.
- [ ] Responsive to mobile; visible keyboard focus; prefers-reduced-motion respected.
- [ ] Attribution credits visible on imagery and cards.

## 13. Out of scope (don't build)

- Real Earth Engine / AEF calls, real occurrence-API verification, real narration LLM calls — all
  mocked here; leave clearly-marked TODO seams.
- Any query path other than the kelp demo (suggestions can be inert).
- Embedding arithmetic, accounts, persistence, settings.