"""Academic-paper lookup for match cards, via the OpenAlex API.

Google Scholar has no official API (and scraping it is unreliable / against
ToS), so we use OpenAlex — free, no key, with citation counts and good coverage
of ecology / environmental science / conservation. We relevance-rank a regional
search, keep papers that clear a citation bar, fall back to the country when the
region is too sparse, and always try to return a small set (2–5).
"""

import re
from datetime import date

import requests

_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    """Strip inline HTML tags OpenAlex sometimes embeds in titles/venues."""
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", text or "")).strip()

OPENALEX = "https://api.openalex.org/works"
MAILTO = "jadeyutseng@gmail.com"  # OpenAlex "polite pool" — faster, identifies us
FIELD_TERMS = "ecology conservation environmental science"


def _search(query: str, per_page: int = 25) -> list:
    """OpenAlex relevance search (default sort = relevance). Returns [] on error."""
    try:
        r = requests.get(
            OPENALEX,
            params={"search": query, "per_page": per_page, "mailto": MAILTO},
            timeout=12,
        )
        r.raise_for_status()
        return r.json().get("results", [])
    except Exception:
        return []


def _qualifies(work: dict, cur_year: int) -> bool:
    """Relevance-by-citation bar (env-science skews local/niche, so be lenient):
    - >=50 citations: established relevance
    - recent (<=1 yr) with >=10: rapid, immediate relevance
    - >=20: niche but respected within a specific community
    """
    c = work.get("cited_by_count") or 0
    y = work.get("publication_year") or 0
    if c >= 50:
        return True
    if y >= cur_year - 1 and c >= 10:
        return True
    if c >= 20:
        return True
    return False


def _country_of(place: str) -> str | None:
    """Last comma-separated segment, e.g.
    'Bilaichari, Chittagong, Bangladesh' -> 'Bangladesh'."""
    if place and "," in place:
        return place.rsplit(",", 1)[-1].strip()
    return None


def _format(work: dict) -> dict:
    authors = [
        a["author"]["display_name"]
        for a in (work.get("authorships") or [])
        if a.get("author") and a["author"].get("display_name")
    ]
    authors_str = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "")

    loc = work.get("primary_location") or {}
    src = loc.get("source") or {}
    venue = src.get("display_name") or ""

    doi = work.get("doi")
    oa_url = (work.get("open_access") or {}).get("oa_url")
    url = doi or oa_url or loc.get("landing_page_url") or work.get("id")

    return {
        "title": _clean(work.get("display_name")) or "Untitled",
        "authors": authors_str,
        "year": work.get("publication_year"),
        "venue": _clean(venue),
        "citations": work.get("cited_by_count") or 0,
        "url": url,
    }


def find_papers(place: str, habitat: str, limit: int = 5) -> list[dict]:
    """Return 2–5 relevant ecology/conservation papers for a region.

    Searches the region first; if too few clear the citation bar, falls back to
    the country; if still sparse, returns the best-cited of whatever matched so
    something useful comes back.
    """
    place = (place or "").strip()
    habitat = (habitat or "").strip()
    cur_year = date.today().year

    seen: set = set()
    pool: list = []

    def add(works: list) -> None:
        for w in works:
            wid = w.get("id")
            if wid and wid not in seen:
                seen.add(wid)
                pool.append(w)

    # 1. region-specific
    add(_search(f"{place} {habitat} {FIELD_TERMS}"))
    qualified = [w for w in pool if _qualifies(w, cur_year)]

    # 2. country fallback when the region is sparse
    country = _country_of(place)
    if len(qualified) < 2 and country and country.lower() != place.lower():
        add(_search(f"{country} {habitat} {FIELD_TERMS}"))
        qualified = [w for w in pool if _qualifies(w, cur_year)]

    # 3. ensure something useful comes back
    chosen = qualified if len(qualified) >= 2 else pool
    chosen = sorted(chosen, key=lambda w: w.get("cited_by_count") or 0, reverse=True)
    return [_format(w) for w in chosen[:limit]]
