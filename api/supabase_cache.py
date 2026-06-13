from supabase import Client


def get_cached(supabase: Client, concept: str) -> dict | None:
    result = (
        supabase.table("search_cache")
        .select("response")
        .eq("concept", concept)
        .maybe_single()
        .execute()
    )
    return result.data["response"] if result.data else None


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
