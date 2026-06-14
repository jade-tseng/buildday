import hashlib
import json
import os
import time
from contextlib import asynccontextmanager

import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ee_runner import run_similarity, sample_reference, sentinel2_thumb_url, CONCEPT_CONFIG
from supabase_cache import get_cached, set_cached, log_query, novel_cache_key
from narrate import generate_dispatch, rewrite_intent, narrate_novel, enrich_matches
from geocode import geocode_point, reverse_geocode
from papers import find_papers

PROJECT = "buildday-499318"

_supabase = None


def _init_supabase():
    global _supabase
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if url and key:
        from supabase import create_client
        _supabase = create_client(url, key)


def _init_ee():
    sa_key = os.environ.get("EE_SA_KEY")
    if sa_key:
        info = json.loads(sa_key)
        creds = ee.ServiceAccountCredentials(info["client_email"], key_data=info["private_key"])
        ee.Initialize(creds, project=PROJECT)
    else:
        # falls back to locally authenticated user (earthengine authenticate)
        ee.Initialize(project=PROJECT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_ee()
    _init_supabase()
    yield


app = FastAPI(lifespan=lifespan)

_extra_origins = [o.strip() for o in os.environ.get("EXTRA_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://rewild-earth.vercel.app",
        "https://rewild-earth-jades-projects-65d65bd0.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
        *_extra_origins,
    ],
    allow_origin_regex=r"https://rewild-earth-[a-z0-9-]+\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Keyword → concept resolver for natural-language prompts (/goal). First concept
# whose keywords appear in the prompt wins; order matters for overlap.
CONCEPT_KEYWORDS = [
    ("prairie", ("prairie", "grassland", "rangeland", "steppe", "montana", "plains", "savanna")),
    ("kelp", ("kelp", "monterey", "reef", "coast", "seaweed", "ocean")),
]


def resolve_concept(prompt: str) -> str | None:
    """Map a free-text prompt to a known concept id, or None if no anchor."""
    p = (prompt or "").lower()
    for concept, keywords in CONCEPT_KEYWORDS:
        if concept in CONCEPT_CONFIG and any(k in p for k in keywords):
            return concept
    return None


def _run_concept(concept: str) -> dict:
    """Shared cache → live-EE → narrate flow used by /search and /goal."""
    t0 = time.time()

    if _supabase:
        cached = get_cached(_supabase, concept)
        if cached:
            log_query(_supabase, concept, cache_hit=True, duration_ms=int((time.time() - t0) * 1000))
            return cached

    response = run_similarity(concept)

    # Optionally enhance dispatch with Anthropic
    try:
        response["dispatch"] = generate_dispatch(
            concept, response["matches"], fallback=response["dispatch"]
        )
    except Exception:
        pass

    if _supabase:
        set_cached(_supabase, concept, response)
        log_query(_supabase, concept, cache_hit=False, duration_ms=int((time.time() - t0) * 1000))

    return response


def _novel_log(seed_name: str, habitat: str) -> list[str]:
    """Synthesize the 5-line status log for a novel query (mirrors curated shape)."""
    return [
        f"⌖ resolving anchor → {seed_name}",
        "⟳ retrieving embedding · year 2024 · 64-d",
        f"⟳ searching similar habitat … {habitat}",
        "✓ scoring global grid · cosine similarity",
        "◍ composing dispatch",
    ]


def _novel_seed(intent: dict):
    """Hybrid seed: geocode the named place, else use Claude's proposed seeds.
    Returns (seeds[list of (lat,lon)], seed_name, seed_coords[lat,lon] or None)."""
    if intent.get("place"):
        pt = geocode_point(intent["place"])
        if pt:
            return [(pt[0], pt[1])], pt[2], [pt[0], pt[1]]
        # geocode failed → fall through to proposed seeds if any
    seeds = [tuple(c) for c in intent.get("proposed_seeds", [])]
    if seeds:
        return seeds, intent["habitat_type"], list(seeds[0])
    return [], intent["habitat_type"], None


NOVEL_SOURCES = [
    {"label": "AlphaEarth Foundations", "url": "https://earthengine.google.com/"},
    {"label": "GBIF", "url": "https://www.gbif.org/"},
]


def _novel_prepare(q: str) -> dict:
    """FAST stage: intent rewrite + hybrid seed + one-shot embedding sample.
    Returns a payload with the reference vector and a fully-built seed block,
    but does NOT run the global grid scan. Raises 422 if no usable seed."""
    intent = rewrite_intent(q)
    key = novel_cache_key(q)

    seeds, seed_name, seed_coords = _novel_seed(intent)
    if not seeds:
        raise HTTPException(status_code=422, detail="could not resolve a seed location")

    ref, _used = sample_reference(seeds)
    if ref is None:
        raise HTTPException(status_code=422, detail="no embedding data at the seed location")

    return {
        "cache_key": key,
        "query": q.strip(),
        "habitat_type": intent["habitat_type"],
        "place": intent.get("place"),
        "ref_vector": ref,
        "seeds": [list(s) for s in seeds],
        "dispatch_preview": intent.get("dispatch_preview", ""),
        "log": _novel_log(seed_name, intent["habitat_type"]),
        "seed": {
            "name": seed_name,
            "coords": seed_coords,
            "species": intent["habitat_type"],
            "habitat": intent.get("dispatch_preview", ""),
            "photo": {
                "url": sentinel2_thumb_url(*seed_coords) if seed_coords else "",
                "credit": "Sentinel-2 / Copernicus (2024)",
            },
        },
    }


def _novel_complete(payload: dict) -> dict:
    """SLOW stage: run the global grid scan with the prepared reference vector,
    then assemble the full Demo (seed/query/log from payload, narrated dispatch)."""
    response = run_similarity(
        seeds=[tuple(s) for s in payload["seeds"]],
        ref_vector=payload["ref_vector"],
        label="novel",
    )

    # enrich the raw (lat,lon) hits with a place name + description: reverse-geocode
    # each match for a factual locality, then let Claude write the label + note.
    matches = response["matches"]
    places = [reverse_geocode(m["coords"][0], m["coords"][1]) for m in matches]
    enriched = enrich_matches(payload["habitat_type"], matches, places)
    for m, e in zip(matches, enriched):
        if e.get("name"):
            m["name"] = e["name"]
        if e.get("note"):
            m["note"] = e["note"]
        # secondary line: the habitat we matched on (generic "signature match" before)
        m["species"] = payload["habitat_type"]

    response["query"] = payload["query"]
    response["seed"] = payload["seed"]
    response["log"] = payload["log"]
    response["sources"] = NOVEL_SOURCES
    response["dispatch"] = narrate_novel(
        payload["habitat_type"], payload.get("place"), response["matches"],
        fallback=payload.get("dispatch_preview", ""),
    )
    return response


def _run_novel(q: str) -> dict:
    """Synchronous end-to-end novel search → Demo-shaped dict (+ cache).
    The always-working fallback for the progressive /resolve + /matches split."""
    t0 = time.time()
    key = novel_cache_key(q)

    if _supabase:
        cached = get_cached(_supabase, key)
        if cached:
            log_query(_supabase, key, cache_hit=True, duration_ms=int((time.time() - t0) * 1000))
            return cached

    payload = _novel_prepare(q)
    response = _novel_complete(payload)

    if _supabase:
        set_cached(_supabase, payload["cache_key"], response)
        log_query(_supabase, payload["cache_key"], cache_hit=False, duration_ms=int((time.time() - t0) * 1000))

    return response


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/search")
def search(concept: str = "kelp"):
    if concept not in CONCEPT_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown concept '{concept}'")
    return _run_concept(concept)


@app.get("/goal")
def goal(q: str = ""):
    """Natural-language search: 'prairie like in Montana — brown dry grassland'
    → resolves to a concept → returns ecologically similar places worldwide."""
    concept = resolve_concept(q)        # Track 1: curated demo concept, instant
    if concept:
        response = _run_concept(concept)
        # echo the user's prompt back as the query the UI displays
        if q.strip():
            response = {**response, "query": q.strip()}
        return response
    return _run_novel(q)                # Track 2: synchronous novel pipeline


@app.get("/resolve")
def resolve(q: str = ""):
    """FAST stage of the progressive UX (~1-3s). Returns enough to center the map
    and drop the seed pin immediately, plus a cache_key the slow /matches reads.

    Curated hit → seed_meta from CONCEPT_CONFIG. Novel → intent + geocode + one
    embedding sample; stashes a pending row so /matches skips re-sampling."""
    concept = resolve_concept(q)
    if concept:
        cfg = CONCEPT_CONFIG[concept]
        cached = bool(_supabase and get_cached(_supabase, concept))
        return {
            "query": q.strip(),
            "track": "curated",
            "concept": concept,
            "cache_key": concept,
            "seed": cfg["seed_meta"],
            "dispatch_preview": cfg["dispatch"],
            "log": cfg["log"],
            "cached": cached,
        }

    # novel — cache key is derived from the query, so we can check the cache
    # before the (slower, non-deterministic) intent rewrite.
    key = novel_cache_key(q)
    cached_full = get_cached(_supabase, key) if _supabase else None
    if cached_full:
        return {
            "query": q.strip(),
            "track": "novel",
            "concept": None,
            "cache_key": key,
            "seed": cached_full.get("seed", {}),
            "dispatch_preview": cached_full.get("dispatch", ""),
            "log": cached_full.get("log", []),
            "cached": True,
        }

    payload = _novel_prepare(q)
    # stash the prepared payload so /matches doesn't re-geocode / re-sample
    if _supabase:
        set_cached(_supabase, "pending:" + key, payload)
    return {
        "query": payload["query"],
        "track": "novel",
        "concept": None,
        "cache_key": key,
        "seed": payload["seed"],
        "dispatch_preview": payload["dispatch_preview"],
        "log": payload["log"],
        "cached": False,
    }


@app.get("/matches")
def matches(cache_key: str = "", q: str = ""):
    """SLOW stage (~30-90s): global grid scan → completed Demo. Idempotent and
    cache-backed. Reads the pending row /resolve stashed; falls back to the full
    synchronous pipeline if the pending row / Supabase is unavailable."""
    # curated cache_key → shared concept flow (cache hit = fast)
    if cache_key and not cache_key.startswith("novel:"):
        if cache_key not in CONCEPT_CONFIG:
            raise HTTPException(status_code=400, detail=f"Unknown concept '{cache_key}'")
        response = _run_concept(cache_key)
        return {**response, "query": q.strip()} if q.strip() else response

    if _supabase and cache_key:
        full = get_cached(_supabase, cache_key)
        if full:
            return full
        pending = get_cached(_supabase, "pending:" + cache_key)
        if pending:
            t0 = time.time()
            demo = _novel_complete(pending)
            set_cached(_supabase, cache_key, demo)
            log_query(_supabase, cache_key, cache_hit=False, duration_ms=int((time.time() - t0) * 1000))
            return demo

    # fallback: no pending row → run the full synchronous novel pipeline from q
    return _run_novel(q)


@app.get("/papers")
def papers(place: str = "", habitat: str = ""):
    """Relevant ecology/conservation papers for a match's region (OpenAlex).
    Returns 2-5 papers; cached by place+habitat so repeats are instant."""
    place = place.strip()
    if not place:
        return {"papers": []}

    key = "papers:" + hashlib.sha1(f"{place.lower()}|{habitat.strip().lower()}".encode()).hexdigest()[:16]
    if _supabase:
        cached = get_cached(_supabase, key)
        if cached:
            return cached

    result = {"papers": find_papers(place, habitat)}
    if _supabase and result["papers"]:
        set_cached(_supabase, key, result)
    return result
