import type { Demo } from "../data/demo";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function fetchSearch(concept: string): Promise<Demo> {
  const res = await fetch(`${API_URL}/search?concept=${concept}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Natural-language search: send the user's prompt to /goal, which resolves it
 *  to a concept server-side and returns ecologically similar places. */
export async function fetchGoal(prompt: string): Promise<Demo> {
  const res = await fetch(`${API_URL}/goal?q=${encodeURIComponent(prompt)}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
