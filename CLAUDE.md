# Rewilding Earth — CLAUDE.md

## Project

A "search the Earth" tool: the user asks where to find a habitat or species; the tool returns ecologically similar places worldwide, verified against real occurrence records, with a narrated answer. Engine: k-NN retrieval over AlphaEarth Foundations satellite embeddings (64-D, 10 m, GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL on Earth Engine). GCP project: `buildday-499318`. GitHub: jade-tseng/buildday.

Stack: Python 3.12 / FastAPI (`api/`), React + Vite + TypeScript (`web/`), Supabase (`supabase/`).

Key files:
- `api/ee_runner.py`      — Earth Engine similarity runner; CONCEPT_CONFIG source of truth
- `api/main.py`           — FastAPI app; /search endpoint, CORS, Supabase integration
- `api/narrate.py`        — Claude narration layer (uses ANTHROPIC_API_KEY)
- `web/src/App.tsx`       — Root React component; globe → search → dispatch
- `web/src/data/demo.ts`  — Mock data for frontend demo path
- `supabase/migrations/`  — Postgres schema
- `PLAN.md`               — Architecture and phase plan; read before structural decisions
- `UI.md`                 — Frontend design spec (ASCII globe → satellite imagery)

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
