import json
import os
import time
from contextlib import asynccontextmanager

import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ee_runner import run_similarity, CONCEPT_CONFIG
from supabase_cache import get_cached, set_cached, log_query
from narrate import generate_dispatch

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


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/search")
def search(concept: str = "kelp"):
    if concept not in CONCEPT_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown concept '{concept}'")

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
