import type { Demo, ResolveResult, Paper } from "../data/demo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function fetchSearch(concept: string): Promise<Demo> {
  const res = await fetch(`${API_URL}/search?concept=${concept}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Natural-language search: send the user's prompt to /goal, which resolves it
 *  to a concept (or runs the novel pipeline) and returns a full result in one
 *  call. Used as the synchronous fallback for the progressive flow below. */
export async function fetchGoal(prompt: string): Promise<Demo> {
  const res = await fetch(`${API_URL}/goal?q=${encodeURIComponent(prompt)}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** FAST stage (~1-3s): geocoded place + dispatch preview + cache_key. */
export async function fetchResolve(prompt: string): Promise<ResolveResult> {
  const res = await fetch(`${API_URL}/resolve?q=${encodeURIComponent(prompt)}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** SLOW stage (~30-90s): global grid scan → completed Demo with matches. */
export async function fetchMatches(cacheKey: string, prompt: string): Promise<Demo> {
  const res = await fetch(
    `${API_URL}/matches?cache_key=${encodeURIComponent(cacheKey)}&q=${encodeURIComponent(prompt)}`
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Relevant ecology/conservation papers for a match's region (OpenAlex). */
export async function fetchPapers(place: string, habitat: string): Promise<Paper[]> {
  const res = await fetch(
    `${API_URL}/papers?place=${encodeURIComponent(place)}&habitat=${encodeURIComponent(habitat)}`
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.papers ?? [];
}
