import hashlib

from supabase import Client


def novel_cache_key(intent_key: str, place: str | None) -> str:
    """Stable cache key for a novel query, stored in the same search_cache table
    (the `concept` column holds any string). e.g. 'novel:1a2b3c4d5e6f7081'."""
    raw = f"{(intent_key or '').strip().lower()}|{(place or '').strip().lower()}"
    return "novel:" + hashlib.sha1(raw.encode()).hexdigest()[:16]


def get_cached(supabase: Client, concept: str) -> dict | None:
    # maybe_single() returns None (not an object) when no row matches, so guard.
    try:
        result = (
            supabase.table("search_cache")
            .select("response")
            .eq("concept", concept)
            .maybe_single()
            .execute()
        )
    except Exception:
        return None
    if result and result.data:
        return result.data["response"]
    return None


def set_cached(supabase: Client, concept: str, response: dict) -> None:
    supabase.table("search_cache").upsert(
        {"concept": concept, "response": response}
    ).execute()


def log_query(supabase: Client, concept: str, cache_hit: bool, duration_ms: int) -> None:
    try:
        supabase.table("query_log").insert(
            {"concept": concept, "cache_hit": cache_hit, "duration_ms": duration_ms}
        ).execute()
    except Exception:
        pass
