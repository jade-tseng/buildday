# Rewilding Earth — MVP / POC build doc

Goal: a "search the Earth" tool. A user asks in natural language —
*"where else in California can I find chanterelle mushrooms? tell me about them"* — and the tool
returns ecologically similar places, verified against real species records, with a short narrated
answer pulling in research.

The engine is **retrieval over AlphaEarth (AEF) embeddings**. A research prototype (Rahman et al.,
arXiv:2604.18715) already proved the core: nearest-neighbor retrieval over AEF is physically
coherent, vector *arithmetic* is not, and a tool-using agent does best on multi-step comparison
queries. We copy their retrieval engine and add a verification + narration layer on top.

---

## Scope decisions (read first)

**In for the MVP**
- Retrieval / similarity search only. **No embedding arithmetic** ("make this place wetter",
  "kelp − cold + warm"). The paper proved it fails on this curved manifold. Do not build it.
- A bounded AOI for the fast path (instant local index) **plus** global reach via Earth Engine
  server-side similarity. Global is a *query pattern*, not a stored index (see Architecture).
- A species-occurrence **verification layer** (iNaturalist / GBIF / OBIS).
- A thin **narration layer** (Claude + a couple of sources) — this is the product differentiator.
- A minimal map + chat UI.

**Out for the MVP (deferred, with reason)**
- Storing a global 10m index. Land is ~149M km² → ~1.5T pixels at 10m → ~95 TB+ even compressed.
  Infeasible and unnecessary; use server-side EE compute + a coarse global index + 10m refine.
- Geometry-aware tools / retrieval-confidence model. Only helps a top-tier model and adds
  complexity; v2.
- Policy tournaments / adversarial panels. v2.

**Concept strategy**
- **Flagship (reliable): a terrestrial habitat concept** — chanterelles in California. Terrestrial
  is AEF's strength; iNaturalist has dense ground truth; and it tells the magic story best ("the
  satellite can't see the mushroom — it recognizes the forest the mushroom needs").
- **Stretch spike (validate, then showcase): kelp.** AEF covers coastal water, but its training
  targets are land-oriented and kelp canopy is temporally volatile vs. AEF's annual composites, so
  whether AEF *separates* kelp is unproven. Test it in Phase 0; promote to showcase if it passes.
- Core principle this rests on: **AEF retrieves by environmental fingerprint. Any concept with a
  consistent, detectable habitat signature works — even an invisible organism — as long as you
  anchor on real occurrence points.**

---

## Architecture

### Engine — five retrieval tools (ported from Rahman et al.)
1. `resolve_location` — natural-language place/region → coordinates (geocoder).
2. `retrieve_embedding` — coordinate + year → the 64-d AEF embedding (+ any co-located env vars).
3. `search_similar` — k-NN in embedding space → physically similar locations. (The core.)
4. `compare_locations` — retrieve and contrast two places' profiles.
5. `interpret_context` — attach human-readable context (land cover, climate band) to a location.

### Anchor resolution (the front of every query)
A concept is resolved to **seed coordinates**, never to a text→embedding lookup (AEF has no text
interface):
- Concept → species/genus → **occurrence API** (iNaturalist for chanterelles; GBIF/OBIS for kelp)
  → real coordinates of known sites. These become the anchors and the verification ground truth.
- If the user supplies the anchor explicitly ("other than Monterey"), geocode it directly.

### Global reach (two real paths, no stored 10m index)
- **Server-side EE similarity (true global, 10m):** compute cosine/dot-product similarity to the
  seed embedding across the global AEF ImageCollection in Earth Engine, **tiled** to stay under
  quota/timeout, reduced to high-similarity candidate regions. Nothing downloaded.
- **Coarse global index + refine (fast candidates):** sample AEF globally at ~1–3 km
  (~15–75M points, a few GB) into a FAISS index for instant candidate generation; refine the
  top regions at 10m in EE. Build this only if the live EE path feels slow.

### Verification layer
For each candidate region, query the occurrence API for the target species/genus and label:
- **Confirmed** — records exist (e.g. "similar habitat in Ecuador, and there are observations").
- **Novel candidate** — similar habitat, no records (undersampled or genuinely absent — surface
  this honestly, it's interesting, not a bug).

### Narration layer (the differentiator)
After retrieval + verification: reverse-geocode the matches, pull 2–3 sources (web search /
OpenAlex), and have Claude narrate the conversational "tell me about them." This is what makes it
feel like a product rather than a GIS tool.

### Orchestration
- MVP can be a plain **tool-calling ReAct loop** via the Anthropic API (Claude as planner) — the
  paper validates this; you do not need the full dynamic-workflows harness for v0.
- Use **dynamic workflows** for the heavier, parallel, repeatable jobs (global tiled similarity,
  bulk verification, index builds). See "Workflows, /goal, /loop" below.

### UI
Map (MapLibre/deck.gl) + chat. Render: seed location, candidate markers colored by
confirmed/novel, and the narrated answer. Pretty but minimal.

---

## Build order

Each phase names a **/goal completion bar** (the hard stop condition you give the agent) and where
**/loop** helps.

**Phase 0 — Validate the signal (half a day, highest leverage).**
In Earth Engine, run one similarity search per concept from known seed coordinates and eyeball
whether matches are ecologically sane. Do this for the terrestrial flagship *and* for kelp.
- /goal: "Don't conclude until you've tested at least 5 seed sites per concept and reported
  whether the top matches are plausible."
- Decision gate: terrestrial should pass easily. If kelp's matches are noise, keep kelp as v2.

**Phase 1 — Bounded-AOI engine (instant local demo).**
Grid-sample AEF over the AOR (e.g. California) at a fine resolution → FAISS index. Implement the
five tools against it. "Where else *in California*" answers fully locally, instantly.
- /goal: "The AOI grid is fully sampled with no gaps before you build the index."

**Phase 2 — Anchor + verification.**
Wire concept → occurrence API → seed coordinates, and the candidate → occurrence verification.
- /loop: re-run verification until every above-threshold candidate is labeled (loop-until-done).

**Phase 3 — Global reach.**
Add server-side EE tiled similarity for "where else *in the world*". (Optionally the coarse global
index.) Verify globally via GBIF/OBIS.
- /goal: "Every high-similarity tile is verified against occurrence records before you stop."
- /loop: tile the globe; loop until no tile yields new candidates.

**Phase 4 — Narration + UI.**
ReAct loop ties it together: resolve → search → verify → enrich → narrate, rendered on the map.

---

## Workflows, /goal, /loop (Claude Code)

**Dynamic workflows** = a JavaScript harness Claude writes that orchestrates many subagents in the
background while your session stays free. Trigger one by including `ultracode` in a prompt or just
saying "use a workflow". Reach for them here on the parallel/repeatable jobs: global tiled
similarity, bulk verification, index builds. Save a good run's script (press `s` in `/workflows`)
into `.claude/workflows/` so it becomes a reusable `/<name>` command; saved workflows can take
input via an `args` global (e.g. a concept or seed list passed at call time).

**/goal — a hard completion bar.** Bind a stop condition the agent must satisfy before it declares
done; this is the antidote to it quitting at "35 of 50". Examples for this project:
- "/goal Every candidate region scoring above the similarity threshold must be checked against
  iNaturalist and labeled confirmed or novel before finishing."
- "/goal The entire AOI grid is sampled — no missing tiles — before building the index."

**/loop — repeat until a condition, or on a cadence.** Examples:
- Loop-until-done: "/loop the global similarity tiling until no tile returns a new candidate."
- Cadence: "/loop the verification refresh weekly as new iNaturalist observations come in."

(Exact flag syntax for /goal and /loop: confirm in the Claude Code docs —
https://docs.anthropic.com/en/docs/claude-code/claude_code_docs_map.md. The usage pattern above —
natural-language completion bar and repetition paired with a workflow — is the intended one.)

**Cost discipline (matters on a $500 LLM budget).** Workflows spawn many agents, so they use more
tokens than a single conversation. The runtime caps a run at 16 concurrent / 1000 total agents,
which bounds runaway cost. Gauge spend by running on a small slice first (one tile, one concept);
the `/workflows` view shows per-agent token usage and you can stop anytime without losing completed
work. Route cheap stages (verification lookups, geocoding) to a smaller model and reserve
Opus-class for planning and narration — describe this in the prompt, or check `/model` before a
large run. Don't leave `/effort ultracode` on for routine dev; it workflow-ifies every task.

---

## Stack
- **AEF access:** Earth Engine (server-side similarity + sampling). Avoid GCS COG downloads.
- **Index:** FAISS (bounded AOI now; optional coarse global later).
- **Occurrence APIs:** iNaturalist, GBIF, OBIS (all free).
- **Agent:** Anthropic API, Opus-class for planning/narration, smaller model for lookups.
- **UI:** MapLibre/deck.gl + a chat box.

## Definition of done (MVP)
A user types "where else in California can I find chanterelles? tell me about them," sees similar
forest habitat on a map with confirmed/novel labels from iNaturalist, and reads a short narrated
answer citing a source or two — answered live, end to end.