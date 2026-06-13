"""Phase 4: Anthropic narration + novel-query intent rewriting."""

import json
import os
import re

_anthropic = None

MODEL = "claude-haiku-4-5-20251001"


def _client():
    global _anthropic
    if _anthropic is None:
        import anthropic
        _anthropic = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _anthropic


def _slug(text: str) -> str:
    """Normalized slug used as a deterministic intent key / cache fallback."""
    s = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
    return s[:48] or "novel_query"


def generate_dispatch(concept: str, matches: list[dict], fallback: str) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return fallback

    match_summary = "\n".join(
        f"- {m['name']} ({m['coords'][0]:.2f}, {m['coords'][1]:.2f}): {m.get('note', '')}"
        for m in matches[:5]
    )
    prompt = (
        f"You are writing a one-paragraph narrated dispatch for a planetary ecological search engine. "
        f"The concept searched was '{concept}'. Top habitat matches found:\n{match_summary}\n\n"
        f"Write a 2-3 sentence dispatch in the style of an instrument readout crossed with field notes. "
        f"Be specific about the ecological signal, not generic. No preamble."
    )

    msg = _client().messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


def _intent_fallback(q: str) -> dict:
    """Deterministic intent when Claude is unavailable or fails — keeps the
    novel pipeline working with no API key (place=None, no proposed seeds)."""
    return {
        "habitat_type": (q or "").strip() or "novel habitat query",
        "place": None,
        "proposed_seeds": [],
        "dispatch_preview": "",
        "intent_key": _slug(q),
    }


def rewrite_intent(q: str) -> dict:
    """Free text → structured ecological intent for the novel-query track.

    Returns a dict:
      habitat_type:    canonical habitat phrase (e.g. "coastal temperate rainforest")
      place:           named place to geocode, or None
      proposed_seeds:  [[lat, lon], ...] representative coords (used ONLY when place is None)
      dispatch_preview: one short instrument-voice teaser (shown before EE finishes)
      intent_key:      normalized slug for the cache key

    Degrades to a deterministic fallback on any error / missing API key.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return _intent_fallback(q)

    prompt = (
        "You translate a free-text ecological search into a structured intent for a "
        "planetary habitat-similarity engine that reads satellite embeddings.\n\n"
        f"User query: {q!r}\n\n"
        "Respond with ONLY a JSON object (no prose, no markdown) with these keys:\n"
        '  "habitat_type": short canonical habitat/ecosystem phrase\n'
        '  "place": the specific named place to anchor on if the user named one, else null\n'
        '  "proposed_seeds": array of up to 4 [lat, lon] pairs that are representative '
        "real-world examples of this habitat — ONLY when no place is named, else []\n"
        '  "dispatch_preview": one or two sentences, instrument-readout-meets-field-notes '
        "voice, describing the habitat signal we will search for\n"
        '  "intent_key": a lowercase_underscore slug naming the habitat\n'
    )
    try:
        msg = _client().messages.create(
            model=MODEL,
            max_tokens=500,
            system="Respond with only a single JSON object. No markdown fences, no commentary.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        # tolerate accidental ```json fences
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        data = json.loads(text)
    except Exception:
        return _intent_fallback(q)

    # normalize / validate
    seeds = []
    for pair in (data.get("proposed_seeds") or [])[:4]:
        try:
            lat, lon = float(pair[0]), float(pair[1])
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                seeds.append([lat, lon])
        except (TypeError, ValueError, IndexError):
            continue
    place = data.get("place")
    if isinstance(place, str) and not place.strip():
        place = None
    return {
        "habitat_type": (data.get("habitat_type") or q or "").strip() or "novel habitat query",
        "place": place,
        "proposed_seeds": seeds,
        "dispatch_preview": (data.get("dispatch_preview") or "").strip(),
        "intent_key": _slug(data.get("intent_key") or data.get("habitat_type") or q),
    }


def narrate_novel(habitat_type: str, place: str | None, matches: list[dict], fallback: str) -> str:
    """Final dispatch for a completed novel search. Degrades to fallback."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return fallback or ""

    anchor = f" anchored on {place}" if place else ""
    match_summary = "\n".join(
        f"- {m['name']} ({m['coords'][0]:.2f}, {m['coords'][1]:.2f}): {m.get('note', '')}"
        for m in matches[:5]
    )
    prompt = (
        "You are writing a one-paragraph narrated dispatch for a planetary ecological "
        f"search engine. The user searched for '{habitat_type}'{anchor}. "
        f"Top habitat matches found:\n{match_summary}\n\n"
        "Write a 2-3 sentence dispatch in the style of an instrument readout crossed with "
        "field notes. Be specific about the ecological signal, not generic. "
        "Plain prose only — no preamble, no markdown, no headings, no bullet points or labels."
    )
    try:
        msg = _client().messages.create(
            model=MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
    except Exception:
        return fallback or ""


def enrich_matches(habitat_type: str, matches: list[dict], places: list) -> list[dict]:
    """Enrich novel match cards with a human place name + a short description.

    `matches` are the raw similarity hits (coords + cosine note); `places` is the
    reverse-geocoded locality string (or None) for each, aligned by index. Makes a
    single Claude call returning, per match, {name, region, note}. Returns a list
    aligned to `matches`; entries are {} on failure so the caller keeps the generic
    card. Degrades to [] entirely if no API key / the call fails.
    """
    if not matches:
        return []
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return [{} for _ in matches]

    lines = []
    for i, (m, place) in enumerate(zip(matches, places)):
        lat, lon = m["coords"][0], m["coords"][1]
        loc = place or "no nearby settlement (remote / open water)"
        lines.append(f"{i}. ({lat:.2f}, {lon:.2f}) — nearest place: {loc} — cosine {m.get('note','')}")
    listing = "\n".join(lines)

    prompt = (
        f"A planetary habitat-similarity search for '{habitat_type}' returned these "
        f"locations (each a satellite-embedding match). For each, write a concise label "
        f"and a one-sentence description.\n\n{listing}\n\n"
        "Respond with ONLY a JSON array, one object per location IN ORDER, each:\n"
        '  "name": short human place label — closest city/region + country '
        '(e.g. "Sitka, Southeast Alaska, USA"); for remote/ocean points say where it is '
        'relative to the nearest land/region.\n'
        '  "region": country or broad region.\n'
        '  "note": ONE sentence (no markdown) on where this is and its ecological '
        f"character relative to '{habitat_type}'.\n"
        "Ground everything in the given coordinates and nearest place — do not invent."
    )
    try:
        msg = _client().messages.create(
            model=MODEL,
            max_tokens=1200,
            system="Respond with only a JSON array. No markdown fences, no commentary.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        data = json.loads(text)
        if not isinstance(data, list):
            return [{} for _ in matches]
    except Exception:
        return [{} for _ in matches]

    out = []
    for i in range(len(matches)):
        e = data[i] if i < len(data) and isinstance(data[i], dict) else {}
        out.append({
            "name": (e.get("name") or "").strip(),
            "region": (e.get("region") or "").strip(),
            "note": (e.get("note") or "").strip(),
        })
    return out
