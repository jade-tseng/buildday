# Rewilding Earth — frontend

A "search the Earth" interface. Ask for a place in plain language and the tool
pins it on an **ASCII globe**, searches for ecologically similar places, and
returns matches verified against species records with a narrated dispatch.

The signature move: the globe is rendered as monospace glyphs (the apparatus
talking), and on search those glyphs **dissolve into real satellite imagery** —
abstraction collapsing into ground truth.

Everything after "user hits enter" is **scripted from mock data** (`src/data/demo.ts`).
This is a front-end build: the look, the motion, and one fully-working demo path.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Deep link `/?run` auto-plays the scripted kelp demo (handy for demos & testing).

## The scripted path

Type (or just press Enter — empty submits the demo query):

> where can i find kelp forests like in monterey bay, ca

1. Globe spins so Monterey faces front; seed pin drops; the status log types out
   the pipeline (resolve → embed → search → verify → compose).
2. ASCII dissolves into satellite imagery at the seed (the hero transition).
3. The map eases back to reveal two match pins + great-circle arcs:
   **Skellig, Ireland** (green / CONFIRMED) and **Galápagos** (amber / NOVEL).
4. The dispatch panel slides in: serif narration, two photo cards, sources.
5. Click a card to fly the map to that location's ground truth.
6. `↺ back to globe` returns to the idle rotating ASCII state.

Any query other than the kelp path returns the in-character empty state
(`⌖ no anchor found …`) — only the kelp demo is wired (by design).

## Architecture

| File | Role |
|------|------|
| `src/App.tsx` | State machine: `idle → flying → dissolving → result`; orchestrates the scripted run |
| `src/components/GlobeCanvas.tsx` | Hand-rolled ASCII globe on `<canvas>` (orthographic projection + lighting + radial burn-off dissolve) |
| `src/components/MapView.tsx` | MapLibre GL satellite map: pins, animated great-circle arcs, fly-to |
| `src/components/QueryBar.tsx` | Query input + staggered status log |
| `src/components/DispatchPanel.tsx` / `MatchCard.tsx` | Serif narration + verification cards |
| `src/data/demo.ts` | The single mock object driving everything |
| `src/lib/landmask.ts` | Coarse procedural land/ocean mask for the globe |
| `src/lib/geo.ts` | Great-circle interpolation, easing |
| `src/styles/tokens.css` | Color + type tokens (the design system) |

## TODO seams (left for the engine team)

- `MapView.tsx` — `// TODO: swap for Earth Engine server-side similarity tiles`.
  The mock uses **Esri World Imagery** (attribution: *Esri, Maxar, Earthstar
  Geographics*) so the zoom-in shows real ground.
- Retrieval, occurrence-record verification, and narration are all mocked in
  `demo.ts`. The status log narrates these as separate steps (the trust story).

## Notes

- Dark throughout; palette/type tokens applied per spec. Hairlines, no shadows.
- `prefers-reduced-motion` respected (cross-fade instead of dissolve, no spin,
  arcs appear statically). Keyboard focus always visible.
- MapLibre needs WebGL; if a context can't be created the map degrades
  gracefully (`MapErrorBoundary`) rather than taking the app down.
- **Demo label note:** Galápagos kelp *was* confirmed by ROV in 2018; we render
  it as NOVEL to exercise both verification states, with an honest footnote on
  the card.
