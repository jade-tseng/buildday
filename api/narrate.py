"""Phase 4: Anthropic narration — stub for now, returns concept config dispatch."""

import os

_anthropic = None


def _client():
    global _anthropic
    if _anthropic is None:
        import anthropic
        _anthropic = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _anthropic


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
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text
