import { useState } from "react";
import type { Match, Paper } from "../data/demo";
import { fetchPapers } from "../util/api";

interface Props {
  match: Match;
  active: boolean;
  onHover: (on: boolean) => void;
  onFocus: () => void;
}

export default function MatchCard({ match, active, onHover, onFocus }: Props) {
  const confirmed = match.status === "CONFIRMED";
  const accent = confirmed ? "var(--biosphere)" : "var(--anomaly)";
  const label = confirmed ? "CONFIRMED" : "NOVEL CANDIDATE";

  // lazy-loaded academic papers for this region (ecology/conservation literature)
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [papersState, setPapersState] = useState<"idle" | "loading" | "done">("idle");

  const loadPapers = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (papersState !== "idle") return;
    setPapersState("loading");
    // real place if we have one, else fall back to coordinates
    const place = /^signature match/i.test(match.name)
      ? `${match.coords[0].toFixed(2)}, ${match.coords[1].toFixed(2)}`
      : match.name;
    try {
      setPapers(await fetchPapers(place, match.species));
    } catch {
      setPapers([]);
    } finally {
      setPapersState("done");
    }
  };

  return (
    <article
      className={`card ${active ? "is-active" : ""}`}
      style={{ ["--accent" as string]: accent }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onFocus}
    >
      <header className="card-head">
        <span className="card-status eyebrow" style={{ color: accent }}>
          <span className="card-dot" /> {label}
        </span>
        <span className="card-coords mono">
          {match.coords[0].toFixed(2)}, {match.coords[1].toFixed(2)}
        </span>
      </header>

      {match.photo.url && (
        <div className="card-photo">
          <img src={match.photo.url} alt={match.name} loading="lazy" />
          {match.photo.credit && (
            <span className="card-credit mono">{match.photo.credit}</span>
          )}
        </div>
      )}

      <h3 className="card-name">{match.name}</h3>
      <p className="card-species mono">{match.species}</p>
      <p className="card-note serif">{match.note}</p>

      {match.footnote && <p className="card-footnote serif">{match.footnote}</p>}

      <div className="card-actions">
        <button
          type="button"
          className="card-fly eyebrow"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
        >
          ⌖ fly to location
        </button>
        {papersState === "idle" && (
          <button
            type="button"
            className="card-src eyebrow"
            onClick={loadPapers}
            title="Find ecology / conservation papers for this region"
          >
            find papers
          </button>
        )}
        {papersState === "loading" && (
          <span className="card-src eyebrow" aria-live="polite">
            searching…
          </span>
        )}
        {match.photo.source && (
          <a
            className="card-src eyebrow"
            href={match.photo.source}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            source ↗
          </a>
        )}
      </div>

      {papersState === "done" && (
        <div className="card-papers" onClick={(e) => e.stopPropagation()}>
          {papers && papers.length > 0 ? (
            <ul className="card-papers-list">
              {papers.map((p, i) => (
                <li key={i} className="card-paper">
                  <a
                    className="card-paper-title serif"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.title}
                  </a>
                  <span className="card-paper-meta mono">
                    {[p.authors, p.year, p.venue].filter(Boolean).join(" · ")}
                    {" · "}
                    {p.citations.toLocaleString()} cit.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-paper-empty mono">no papers found for this region</p>
          )}
        </div>
      )}
    </article>
  );
}
