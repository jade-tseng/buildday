import { useEffect, useState } from "react";
import type { Demo } from "../data/demo";
import MatchCard from "./MatchCard";

interface Props {
  demo: Demo;
  visible: boolean;
  activeId: string | null;
  reducedMotion: boolean;
  onHover: (id: string | null) => void;
  onFocusMatch: (id: string) => void;
  onBack: () => void;
}

export default function DispatchPanel({
  demo,
  visible,
  activeId,
  reducedMotion,
  onHover,
  onFocusMatch,
  onBack,
}: Props) {
  // type the dispatch prose on, character by character (§6 step 6)
  const [typed, setTyped] = useState(reducedMotion ? demo.dispatch : "");

  useEffect(() => {
    if (!visible) {
      setTyped(reducedMotion ? demo.dispatch : "");
      return;
    }
    if (reducedMotion) {
      setTyped(demo.dispatch);
      return;
    }
    let i = 0;
    const full = demo.dispatch;
    const id = window.setInterval(() => {
      i += 3;
      setTyped(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [visible, demo.dispatch, reducedMotion]);

  const doneTyping = typed.length >= demo.dispatch.length;

  return (
    <aside className={`dispatch ${visible ? "is-visible" : ""}`} aria-hidden={!visible}>
      <div className="dispatch-inner">
        <header className="dispatch-head">
          <div>
            <span className="eyebrow">seed</span>
            <h2 className="dispatch-seed">{demo.seed.name}</h2>
          </div>
          <span className="dispatch-coords mono">
            {demo.seed.coords[0].toFixed(2)}, {demo.seed.coords[1].toFixed(2)}
          </span>
        </header>

        <p className="dispatch-habitat mono">{demo.seed.habitat}</p>

        <hr className="rule" />

        <p className="dispatch-prose serif">
          <span className="dispatch-mark" aria-hidden="true">
            ◍
          </span>{" "}
          {typed}
          {!doneTyping && <span className="caret" aria-hidden="true">▍</span>}
        </p>

        <div className={`dispatch-cards ${doneTyping ? "is-revealed" : ""}`}>
          {demo.matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              active={activeId === m.id}
              onHover={(on) => onHover(on ? m.id : null)}
              onFocus={() => onFocusMatch(m.id)}
            />
          ))}
        </div>

        <footer className="dispatch-sources mono">
          <span className="eyebrow">sources:</span>{" "}
          {demo.sources.map((s, i) => (
            <span key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
              {i < demo.sources.length - 1 ? " · " : ""}
            </span>
          ))}
        </footer>
      </div>

      <button type="button" className="dispatch-back eyebrow" onClick={onBack}>
        ↺ back to globe
      </button>
    </aside>
  );
}
