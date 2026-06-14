import type { Match } from "../data/demo";

interface Props {
  match: Match;
  active: boolean;
  onHover: (on: boolean) => void;
  onFocus: () => void;
}

// Google Scholar search for this region, scoped to the ecology/conservation
// literature. Scholar indexes journals + arXiv preprints, so it's the right
// single entry point for ecology / environmental science / conservation work.
function scholarUrl(match: Match): string {
  // fall back to coordinates if the card never got a real place label
  const place = /^signature match/i.test(match.name)
    ? `${match.coords[0].toFixed(2)}, ${match.coords[1].toFixed(2)}`
    : match.name;
  const q = [
    `"${place}"`,
    match.species,
    '(ecology OR conservation OR "environmental science")',
  ]
    .filter(Boolean)
    .join(" ");
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`;
}

export default function MatchCard({ match, active, onHover, onFocus }: Props) {
  const confirmed = match.status === "CONFIRMED";
  const accent = confirmed ? "var(--biosphere)" : "var(--anomaly)";
  const label = confirmed ? "CONFIRMED" : "NOVEL CANDIDATE";

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
        <a
          className="card-src eyebrow"
          href={scholarUrl(match)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Search ecology / conservation papers for this region on Google Scholar"
        >
          find papers ↗
        </a>
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
    </article>
  );
}
