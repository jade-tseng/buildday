import { useEffect, useRef, useState } from "react";
import { SUGGESTIONS } from "../data/demo";

interface Props {
  docked: boolean; // centered in idle, docked to top after first search
  running: boolean; // pipeline in flight → icon becomes spinner
  log: string[]; // status-log lines, revealed one at a time by the parent
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export default function QueryBar({
  docked,
  running,
  log,
  value,
  onChange,
  onSubmit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!docked) inputRef.current?.focus();
  }, [docked]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit();
  };

  return (
    <div className={`qbar ${docked ? "qbar--docked" : "qbar--center"}`}>
      {log.length > 0 && (
        <ul className="qbar-log mono" aria-live="polite">
          {log.map((line, i) => (
            <li key={i} className="qbar-log-line" style={{ animationDelay: `${i * 40}ms` }}>
              {line}
            </li>
          ))}
        </ul>
      )}

      <form
        className={`qbar-field ${focused ? "is-focused" : ""}`}
        onSubmit={submit}
        role="search"
      >
        <span className="qbar-reticle mono" aria-hidden="true">
          {running ? <span className="qbar-spin">⟳</span> : "⌖"}
        </span>
        <input
          ref={inputRef}
          className="qbar-input mono"
          type="text"
          value={value}
          placeholder="where can i find kelp forests like monterey…"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={running}
          spellCheck={false}
          autoComplete="off"
          aria-label="Ask the planet for a place"
        />
        <button className="qbar-submit" type="submit" aria-label="Search" disabled={running}>
          →
        </button>
      </form>

      {!docked && (
        <div className="qbar-suggest">
          <span className="eyebrow">try:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="qbar-chip mono"
              onClick={() => {
                onChange(s);
              }}
              // only the kelp path fully works; suggestions hint at scope (§5)
              title="demo scope: kelp path only"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
