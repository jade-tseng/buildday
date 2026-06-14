# Rewilding Earth — CLAUDE.md

## Project

A "search the Earth" tool: the user asks where to find a habitat or species; the tool returns ecologically similar places worldwide, verified against real occurrence records, with a narrated answer. Engine: k-NN retrieval over AlphaEarth Foundations satellite embeddings (64-D, 10 m, GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL on Earth Engine). GCP project: `buildday-499318`. GitHub: jade-tseng/buildday.

Stack: Python 3.12 / FastAPI (`api/`), React + Vite + TypeScript (`web/`), Supabase (`supabase/`).

Key files:
- `api/ee_runner.py`      — Earth Engine similarity runner; CONCEPT_CONFIG source of truth
- `api/main.py`           — FastAPI app; /search /goal /resolve /matches endpoints, CORS, Supabase
- `api/narrate.py`        — Claude narration layer (uses ANTHROPIC_API_KEY)
- `web/src/App.tsx`       — Root React component; globe → search → dispatch
- `web/src/data/demo.ts`  — Mock data for frontend demo path
- `supabase/migrations/`  — Postgres schema
- `api/geocode.py`        — Nominatim geocode / reverse-geocode (novel-query track)
- `api/supabase_cache.py` — cache get/set + `novel_cache_key`
- `web/src/util/api.ts`   — frontend API client (fetchSearch/fetchGoal/fetchResolve/fetchMatches)
- `web/src/components/AboutSection.tsx` — scroll-down "page 2" dossier
- `PLAN.md`               — Architecture and phase plan; read before structural decisions
- `UI.md`                 — Frontend design spec (ASCII globe → satellite imagery)

---

## What's been built (current state)

The POC is **live in production** and end-to-end functional. Read this before
changing the search flow or the deploy.

### Live deployment
- **Frontend** → https://rewild-earth.vercel.app (Vercel project `rewild-earth`, root dir `web/`).
- **API** → https://rewilding-api-255790304452.us-west1.run.app (Cloud Run `rewilding-api`, region `us-west1`, project `buildday-499318`; `--timeout=300 --memory=2Gi --allow-unauthenticated`).
- **Supabase (cloud)** → project ref `qegqjkcjhyhheobrwjgp` (region us-west-2); tables `search_cache` + `query_log`.
- **Secrets in GCP Secret Manager** (wired to Cloud Run via `--set-secrets`/`--update-secrets`, never bare env vars): `ee-sa-key`, `supabase-service-key`, `ANTHROPIC_API_KEY`. `SUPABASE_URL` is a plain env var.
- **Artifact Registry** → `us-west1-docker.pkg.dev/buildday-499318/rewilding/api:latest`.
- IAM gotcha: the EE service account `ee-runner@buildday-499318` needs `roles/serviceusage.serviceUsageConsumer` or EE init 403s on Cloud Run startup.

### The two-track search model
Both tracks return the same **Demo-shaped JSON** (`query, seed, dispatch, matches[], sources[], log[]`) and are cache-first (Supabase).

- **Track 1 — curated concepts (instant):** known concepts in `CONCEPT_CONFIG` (currently `kelp`, `prairie`). `kelp` is hand-curated (`KELP_DEMO` in `scripts/seed_cache.py`; AEF is land-only so live kelp is false positives). `prairie` runs real EE and is grounded with `MATCH_LABELS` (REPORT.md CONFIRMED/NOVEL labels) + Sentinel-2 thumbnails.
- **Track 2 — novel queries (live):** any free-text query that doesn't resolve to a concept. Flow: `rewrite_intent` (Claude → habitat + named place + dispatch preview) → **hybrid seed** (geocode the named place via Nominatim and sample *its* AEF embedding, else use Claude-proposed seed coords) → global cosine similarity → **reverse-geocode + Claude-enrich each match** (real place name + one-line description) → narrated dispatch → cache.
- **Progressive UX** (EE scan is 15–90s): `GET /resolve` returns fast (intent + geocode + one seed sample + preview + `cache_key`, stashing a `pending:` row); `GET /matches` runs the slow global scan reading that row. Synchronous `GET /goal` is the always-working fallback. `novel_cache_key` hashes the **normalized query** (deterministic) so repeats hit cache.

### Endpoints (`api/main.py`)
- `GET /health` → `{ok:true}`
- `GET /search?concept=<id>` → curated concept, cache-first (explicit id).
- `GET /goal?q=<text>` → NL: `resolve_concept()` → curated, else `_run_novel()` (synchronous novel).
- `GET /resolve?q=<text>` → fast stage (curated seed_meta, or novel intent+geocode+sample); returns `cache_key` + `cached`.
- `GET /matches?cache_key=&q=` → slow stage → completed Demo (idempotent, cache-backed; falls back to full `_run_novel`).

### Backend modules
- `ee_runner.py` — `CONCEPT_CONFIG`; `run_similarity(concept=… | seeds=… | ref_vector=…)` (one ranking path for curated + novel); `sample_reference()` fast seed sample; `MATCH_LABELS`, `sentinel2_thumb_url`, `_build_matches`.
- `narrate.py` — Anthropic (`claude-haiku-4-5-20251001`): `generate_dispatch`, `rewrite_intent`, `narrate_novel`, `enrich_matches`. All degrade to deterministic fallbacks with no key.
- `geocode.py` — `geocode_point` / `reverse_geocode` (Nominatim; **requires a descriptive `User-Agent`** — default UA is blocked).
- `supabase_cache.py` — `get_cached` (guarded against `maybe_single()` returning `None`), `set_cached`, `log_query`, `novel_cache_key`.

### Frontend (`web/src/`)
- `App.tsx` — phase machine `idle → flying → dissolving → result`. `doSearch` chains `/resolve` → `/matches`; animation split into `runPlaceLoaded` (fly + drop seed, matches deferred) and `revealMatches` (pins + final dispatch). Fallback ladder: `/resolve` → `/goal` → local `DEMOS` mock. Any non-empty query reaches the backend (no client-side concept gate). Title "REWILD EARTH" is a home button.
- `util/api.ts`, `data/demo.ts` (`Demo`/`Match`/`ResolveResult` types + offline mocks), `components/AboutSection.tsx`.

### Deploy runbook
```bash
# API (from api/): build MUST be linux/amd64 (Cloud Run rejects arm64 from Apple Silicon);
# Dockerfile uses `uv` (plain pip backtracks through unpinned fastapi/pydantic and hangs).
docker buildx build --platform linux/amd64 \
  -t us-west1-docker.pkg.dev/buildday-499318/rewilding/api:latest --push api/
gcloud run deploy rewilding-api --region=us-west1 \
  --image=us-west1-docker.pkg.dev/buildday-499318/rewilding/api:latest --project=buildday-499318
# (add --update-secrets=NAME=secret:latest only when wiring a new secret)

# Frontend (from web/): VITE_API_URL is a Vercel prod env var → Cloud Run URL.
npx vercel --prod --yes
# the clean alias does NOT auto-follow prod — re-point it each deploy:
npx vercel alias set <new-deployment>.vercel.app rewild-earth.vercel.app
```
Vercel deployment protection (SSO) is **off** so the demo is public.

### How it was built (PR arc, oldest→newest)
earth-engine skill → frontend UI → repo/backend setup → frontend↔API wiring →
deploy-config (Cloud Run + Vercel + CORS) → `/goal` NL endpoint + prairie grounding →
novel-query track (intent → hybrid seed → progressive `/resolve`+`/matches`) →
match enrichment (reverse-geocode + Claude) → frontend copy/UX fixes.

---

## Multi-agent session protocol

This repo runs 5-6 concurrent Claude Code sessions. Each session works in a dedicated git worktree to avoid file collisions (shared index, node_modules, build artifacts). Read this section at the start of every session.

### Starting a new session

```bash
bash /Users/jade/Documents/buildday/scripts/new-session.sh <taskname>
```

This creates `../buildday-<taskname>/` as a git worktree on branch `feat/<taskname>` from `origin/main`. Open that directory in Claude Code — do not work in the main `buildday/` directory.

After the script runs:

```bash
git fetch origin && git rebase origin/main   # pull in latest merged work
gh pr list --repo jade-tseng/buildday        # see what other agents are doing
git branch -r | grep -v HEAD                 # see all in-flight branches
```

Read open PRs before writing code. If another session touches a file you need, wait for their merge or structure around the overlap.

### During a session

- Commit after each logical unit (working function, passing test, complete component). Do not batch a whole session into one commit.
- Commit message: imperative, present tense, ≤72 chars. Add `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` when Claude produced the commit.
- Never commit to `main`. Never `git push --force`.
- Rebase frequently: `git fetch origin && git rebase origin/main`
- **Port assignments** — avoid collisions when running dev servers in parallel. Pick any uncolliding port: `uvicorn main:app --reload --port <PORT>` and `npm run dev -- --port <PORT>`.

### Ending a session or reaching a milestone

Open a PR at session end, or sooner after each self-contained milestone. Small PRs merge faster and unblock other sessions sooner.

```bash
git fetch origin && git rebase origin/main
git push -u origin feat/<taskname>
gh pr create \
  --repo jade-tseng/buildday \
  --title "[agent/<taskname>] <imperative description>" \
  --body "$(cat <<'EOF'
## What changed
- <bullet>

## What's next
- <bullet>

## Blocked on
- <none> OR <dependency>

🤖 Agent session: feat/<taskname>
EOF
)"
```

### If you need another agent's unmerged work

**Option A — wait for merge (preferred):** monitor with `gh pr list`, then `git fetch origin && git rebase origin/main` once merged.

**Option B — cherry-pick:** `git fetch origin && gh pr view <number> --repo jade-tseng/buildday` to find the SHA, then `git cherry-pick <sha>`. Note it in your PR description — it resolves naturally when you rebase after the source PR merges.

### Branch naming

`feat/<taskname>` — lowercase, hyphen-separated, matching the worktree directory name.

---

## Environment setup (per worktree)

```bash
# Python backend:
cd api && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Frontend:
cd web && npm install

# Required .env at worktree root (already .gitignored):
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
ANTHROPIC_API_KEY=...
# Earth Engine auth uses ~/.config/earthengine/ (shared across worktrees, no per-worktree setup)
```

## Dev commands

```bash
# Backend (from api/):  uvicorn main:app --reload --port 8000
# Frontend (from web/): npm run dev -- --port 5173
# Supabase (from root): supabase start && supabase db push
```

---

## Architecture decisions (do not reverse without discussion)

- **No embedding arithmetic.** AEF operates on a curved manifold; vector arithmetic fails. Retrieval only (k-NN). See PLAN.md.
- **Kelp is v2.** AlphaEarth is land-only; kelp seeds sample coastal land, not canopy. Kept in CONCEPT_CONFIG as a demo path, marked v2.
- **No stored 10 m global index.** ~95 TB is infeasible. Use server-side EE tiled compute.
- **Narration via Anthropic API** (ANTHROPIC_API_KEY), not OpenAI or local models.
- **Cache via Supabase**, not Redis or in-memory. Schema in `supabase/migrations/`.
- **Frontend mock seams in `web/src/data/demo.ts`** — do not remove; real API wiring goes through these seams.
