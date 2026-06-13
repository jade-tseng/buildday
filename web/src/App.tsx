import { useCallback, useEffect, useRef, useState } from "react";
import GlobeCanvas, { type GlobePhase } from "./components/GlobeCanvas";
import MapView from "./components/MapView";
import MapErrorBoundary from "./components/MapErrorBoundary";
import QueryBar from "./components/QueryBar";
import DispatchPanel from "./components/DispatchPanel";
import AboutSection from "./components/AboutSection";
import { DEMO, detectConcept, pickMock, type Coords, type Demo } from "./data/demo";
import { fetchGoal } from "./util/api";
import "./styles/app.css";

type Phase = "idle" | "flying" | "dissolving" | "result";

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
};

export default function App() {
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Demo>(DEMO);

  const [dissolve, setDissolve] = useState(0);
  const [showSeed, setShowSeed] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [dispatchVisible, setDispatchVisible] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ coords: Coords; key: number } | null>(null);

  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => () => clearTimers(), []);

  // run a goal query against the API, falling back to the local mock on failure
  const runGoal = useCallback((q: string) => {
    setRunning(true);
    setError(null);
    setLog(["⌖ connecting…"]);
    fetchGoal(q)
      .then((data) => {
        setResult(data);
        runAnimation(data);
      })
      .catch(() => {
        const mock = pickMock(q);
        setResult(mock);
        runAnimation(mock);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deep-links (handy for demos & testing):
  //   /?run            → kelp demo query
  //   /?goal=<prompt>  → run any goal prompt (e.g. ?goal=prairie like in montana)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const goalQ = params.get("goal");
    if (goalQ) {
      setQuery(goalQ);
      after(600, () => runGoal(goalQ));
    } else if (params.has("run")) {
      setQuery(DEMO.query);
      after(600, () => runGoal(DEMO.query));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the scripted run (§6) ────────────────────────────────────────────────
  const runAnimation = useCallback((data: Demo) => {
    clearTimers();
    setError(null);
    setRunning(true);
    setLog([]);
    setPhase("flying"); // globe spins seed to front; seed pin faces us

    // status log types out, ~600ms stagger (§5)
    data.log.forEach((line, i) => {
      after(350 + i * 600, () => setLog((l) => [...l, line]));
    });

    // seed pin drops shortly after the spin begins to settle
    after(900, () => setShowSeed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fly (spin) finished → dissolve ASCII into satellite (§4)
  const onFlyComplete = useCallback(() => {
    setPhase("dissolving");
    if (reducedMotion) {
      // reduced motion: cross-fade instead of radial burn (§10)
      setDissolve(1);
      after(450, () => finishToResult());
      return;
    }
    // animate the radial burn-off 0→1 over ~1.4s
    const start = performance.now();
    const DUR = 1400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      setDissolve(t);
      if (t < 1) requestAnimationFrame(tick);
      else finishToResult();
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const finishToResult = useCallback(() => {
    setPhase("result");
    setShowMatches(true); // pins drop with stagger + arcs draw (MapView)
    // dispatch slides in after the pins begin to land
    after(reducedMotion ? 0 : 700, () => setDispatchVisible(true));
    after(reducedMotion ? 0 : 900, () => setRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const onSubmit = useCallback(() => {
    const q = query.trim() || DEMO.query; // empty Enter runs the demo
    if (!detectConcept(q)) {
      // empty/error state stays in character (§11)
      setError("⌖ no anchor found — try a place or a species");
      return;
    }
    if (!query.trim()) setQuery(DEMO.query);
    runGoal(q);
  }, [query, runGoal]);

  const backToGlobe = useCallback(() => {
    clearTimers();
    setRunning(false);
    setDispatchVisible(false);
    setShowMatches(false);
    setShowSeed(false);
    setActiveId(null);
    setFocus(null);
    setLog([]);
    setError(null);
    setDissolve(0);
    setPhase("idle");
  }, []);

  const focusMatch = useCallback((id: string) => {
    const m = result.matches.find((x) => x.id === id);
    if (!m) return;
    setActiveId(id);
    setFocus({ coords: m.coords, key: Date.now() });
  }, [result]);

  const globePhase: GlobePhase =
    phase === "result" ? "hidden" : (phase as GlobePhase);
  const mapMounted = phase === "dissolving" || phase === "result";
  const docked = phase !== "idle";

  const scrollToAbout = () => {
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
    <div className={`app phase-${phase}`}>
      {/* top bar */}
      <header className="topbar mono">
        <span className="topbar-title">REWILDING&nbsp;EARTH</span>
        <span className="topbar-right">
          <span className="topbar-live">
            <span className="topbar-live-dot" /> live
          </span>
          <Ticker phase={phase} seedCoords={result.seed.coords} />
        </span>
      </header>

      {/* stage: globe + map share the same frame; query bar floats over it */}
      <div className="stage">
        <div
          className="stage-map"
          style={{ opacity: mapMounted ? 1 : 0 }}
          aria-hidden={!mapMounted}
        >
          {mapMounted && (
            <MapErrorBoundary>
              <MapView
                seed={result.seed}
                matches={result.matches}
                showSeed={showSeed}
                showMatches={showMatches}
                activeId={activeId}
                focus={focus}
                reducedMotion={reducedMotion}
                onSelect={setActiveId}
              />
            </MapErrorBoundary>
          )}
        </div>

        <div
          className="stage-globe"
          style={{
            display: phase === "result" ? "none" : "block",
            opacity: phase === "dissolving" ? Math.max(0, 1 - dissolve * 0.9) : 1,
          }}
        >
          <GlobeCanvas
            phase={globePhase}
            seed={result.seed.coords}
            dissolveProgress={dissolve}
            reducedMotion={reducedMotion}
            onFlyComplete={onFlyComplete}
          />
        </div>

        <QueryBar
          docked={docked}
          running={running}
          log={log}
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (error) setError(null);
          }}
          onSubmit={onSubmit}
          onPick={(q) => {
            setQuery(q);
            runGoal(q);
          }}
        />

        {error && <div className="error-line mono">{error}</div>}

        {/* imagery attribution (§7) */}
        {mapMounted && (
          <div className="credit mono">Esri, Maxar, Earthstar Geographics</div>
        )}

        {/* scroll-down affordance → the About dossier (idle only) */}
        {phase === "idle" && (
          <button
            className="scroll-cue"
            onClick={scrollToAbout}
            aria-label="Scroll down to learn about this tool"
          >
            <span>about this instrument</span>
            <span className="scroll-cue-arrow" aria-hidden="true">
              ↓
            </span>
          </button>
        )}
      </div>

      <DispatchPanel
        demo={result}
        visible={dispatchVisible}
        activeId={activeId}
        reducedMotion={reducedMotion}
        onHover={setActiveId}
        onFocusMatch={focusMatch}
        onBack={backToGlobe}
      />
    </div>

      <AboutSection />
    </>
  );
}

// slowly ticking coordinate readout — sells "instrument" (§4)
function Ticker({ phase, seedCoords }: { phase: Phase; seedCoords: Coords }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), 900);
    return () => window.clearInterval(id);
  }, []);
  if (phase === "result") {
    return (
      <span className="topbar-coord">
        {seedCoords[0].toFixed(2)} / {seedCoords[1].toFixed(2)}
      </span>
    );
  }
  // a drifting lat/lon while idle
  const lat = (Math.sin(t / 7) * 64).toFixed(2);
  const lon = (((t * 6) % 360) - 180).toFixed(2);
  return (
    <span className="topbar-coord">
      {lat} / {lon}
    </span>
  );
}
