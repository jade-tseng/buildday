import { useCallback, useEffect, useRef, useState } from "react";
import GlobeCanvas, { type GlobePhase } from "./components/GlobeCanvas";
import MapView from "./components/MapView";
import MapErrorBoundary from "./components/MapErrorBoundary";
import QueryBar from "./components/QueryBar";
import DispatchPanel from "./components/DispatchPanel";
import AboutSection from "./components/AboutSection";
import { DEMO, pickMock, type Coords, type Demo, type ResolveResult } from "./data/demo";
import { fetchGoal, fetchResolve, fetchMatches } from "./util/api";
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

  // progressive flow coordination: the slow /matches result may arrive before
  // or after the fly→dissolve animation reaches the result stage.
  const matchesPendingRef = useRef<Demo | null>(null);
  const placeDoneRef = useRef(false);

  useEffect(() => () => clearTimers(), []);

  // ── progressive search (two-stage: /resolve fast → /matches slow) ─────────
  const doSearch = useCallback((q: string) => {
    clearTimers();
    matchesPendingRef.current = null;
    placeDoneRef.current = false;
    setRunning(true);
    setError(null);
    setLog(["⌖ connecting…"]);

    fetchResolve(q)
      .then((r) => {
        runPlaceLoaded(r); // center map + drop seed + preview, immediately
        const slow = r.cached ? fetchGoal(q) : fetchMatches(r.cache_key, q);
        slow
          .then((full) => runMatchesLoaded(full))
          .catch(() => {
            // we still have the anchor on screen — degrade gracefully
            setLog((l) => [...l, "⚠ global scan unavailable — showing anchor only"]);
            fetchGoal(q)
              .then((full) => runMatchesLoaded(full))
              .catch(() => setRunning(false));
          });
      })
      .catch(() => {
        // /resolve failed entirely → synchronous /goal, then local mock
        fetchGoal(q)
          .then((full) => { setResult(full); runAnimation(full); })
          .catch(() => { const mock = pickMock(q); setResult(mock); runAnimation(mock); });
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
      after(600, () => doSearch(goalQ));
    } else if (params.has("run")) {
      setQuery(DEMO.query);
      after(600, () => doSearch(DEMO.query));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the scripted run (§6) ────────────────────────────────────────────────
  // single-shot path (fallback / deep-link): full Demo is already in `result`.
  const runAnimation = useCallback((data: Demo) => {
    clearTimers();
    matchesPendingRef.current = data; // matches already present → reveal at result
    placeDoneRef.current = false;
    setError(null);
    setRunning(true);
    setShowMatches(false);
    setDispatchVisible(false);
    setShowSeed(false);
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

  // progressive stage 1: place resolved → fly + drop seed, matches deferred.
  const runPlaceLoaded = useCallback((r: ResolveResult) => {
    clearTimers();
    matchesPendingRef.current = null;
    placeDoneRef.current = false;
    // a place-only Demo: seed + preview dispatch, no matches yet
    setResult({
      query: r.query,
      seed: r.seed,
      dispatch: r.dispatch_preview,
      matches: [],
      sources: [],
      log: r.log,
    });
    setError(null);
    setRunning(true);
    setShowMatches(false);
    setDispatchVisible(false);
    setShowSeed(false);
    setLog([]);
    setPhase("flying");
    r.log.forEach((line, i) => {
      after(350 + i * 600, () => setLog((l) => [...l, line]));
    });
    after(900, () => setShowSeed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reveal the completed result (match pins + final dispatch).
  const revealMatches = useCallback((full: Demo) => {
    setResult(full);
    setPhase("result");
    setShowMatches(true); // pins drop with stagger + arcs draw (MapView)
    after(reducedMotion ? 0 : 200, () => setDispatchVisible(true));
    after(reducedMotion ? 0 : 400, () => setRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // progressive stage 2: slow /matches returned. Apply now if the animation has
  // already settled at the result stage, else stash for finishToResult.
  const runMatchesLoaded = useCallback((full: Demo) => {
    matchesPendingRef.current = full;
    if (placeDoneRef.current) revealMatches(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealMatches]);

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
    placeDoneRef.current = true;
    setPhase("result");
    if (matchesPendingRef.current) {
      // matches already here (single-shot, cached, or fast) → reveal them
      revealMatches(matchesPendingRef.current);
    } else {
      // progressive: anchor is placed; keep scanning (spinner/log stay live)
      // and show the dispatch preview while /matches runs.
      after(reducedMotion ? 0 : 500, () => setDispatchVisible(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, revealMatches]);

  const onSubmit = useCallback(() => {
    const q = query.trim() || DEMO.query; // empty Enter runs the demo
    if (!query.trim()) setQuery(DEMO.query);
    // any non-empty query is allowed — the backend decides curated vs. novel
    doSearch(q);
  }, [query, doSearch]);

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

  // clicking the title returns to the idle home (globe + empty query)
  const goHome = useCallback(() => {
    backToGlobe();
    setQuery("");
  }, [backToGlobe]);

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
        <button
          type="button"
          className="topbar-title"
          onClick={goHome}
          aria-label="Back to home"
        >
          REWILD&nbsp;EARTH
        </button>
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
            doSearch(q);
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
