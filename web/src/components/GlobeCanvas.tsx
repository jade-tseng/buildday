import { useEffect, useRef } from "react";
import type { Coords } from "../data/demo";
import { isLand } from "../util/landmask";
import { easeInOutCubic } from "../util/geo";

export type GlobePhase = "idle" | "flying" | "dissolving" | "hidden";

interface Props {
  phase: GlobePhase;
  seed: Coords | null;
  /** 0..1 radial burn-off progress, driven by the parent during `dissolving`. */
  dissolveProgress: number;
  reducedMotion: boolean;
  onFlyComplete: () => void;
}

const DEG = Math.PI / 180;
const TILT = 16 * DEG; // gentle axial tilt so it reads as a planet
const SPIN_PER_SEC = 6 * DEG; // idle rotation, ~6°/sec (UI.md §4)
const FLY_MS = 1200; // "camera flies to the seed" (§4)

// glyph ramps: ocean fades to nothing, land builds to solid. Dark→light.
const OCEAN = [" ", "·", ".", ":", "░"];
const LAND = ["░", "▒", "▓", "█"];

export default function GlobeCanvas({
  phase,
  seed,
  dissolveProgress,
  reducedMotion,
  onFlyComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // mutable render state held in refs so the rAF loop never gets stale closures
  const lon0 = useRef(0); // current spin angle (radians)
  const flyFrom = useRef(0);
  const flyTarget = useRef(0);
  const flyStart = useRef(0);
  const flying = useRef(false);
  const phaseRef = useRef(phase);
  const dissolveRef = useRef(dissolveProgress);
  const flyDoneRef = useRef(onFlyComplete);

  phaseRef.current = phase;
  dissolveRef.current = dissolveProgress;
  flyDoneRef.current = onFlyComplete;

  // Kick off the "fly to seed" spin when we enter the flying phase.
  useEffect(() => {
    if (phase !== "flying" || !seed) return;
    const targetLon = -seed[1] * DEG;
    // pick the equivalent target angle nearest the current angle (shortest path)
    let t = targetLon;
    const twoPi = Math.PI * 2;
    while (t - lon0.current > Math.PI) t -= twoPi;
    while (t - lon0.current < -Math.PI) t += twoPi;

    if (reducedMotion) {
      lon0.current = t;
      onFlyComplete();
      return;
    }
    flyFrom.current = lon0.current;
    flyTarget.current = t;
    flyStart.current = performance.now();
    flying.current = true;
  }, [phase, seed, reducedMotion, onFlyComplete]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const css = getComputedStyle(document.documentElement);
    const C_BONE_DIM = css.getPropertyValue("--bone-dim").trim() || "#8A9590";
    const C_BONE = css.getPropertyValue("--bone").trim() || "#E9EDEA";
    const C_SIGNAL = css.getPropertyValue("--signal").trim() || "#4DA3FF";

    let cw = 0;
    let chh = 0;
    let cols = 0;
    let rows = 0;
    let cx = 0;
    let cy = 0;
    let radius = 0;
    let fontPx = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      radius = Math.min(w, h) * 0.42;
      // size the character cell relative to the globe so ~46 glyphs span it
      fontPx = Math.max(8, Math.round((radius * 2) / 46));
      cw = fontPx * 0.6; // monospace advance
      chh = fontPx * 1.02;
      cols = Math.ceil(w / cw);
      rows = Math.ceil(h / chh);
      cx = w / 2;
      cy = h / 2;
      ctx.font = `${fontPx}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
    };

    // light comes from upper-left-front; terminator falls to the right limb
    const LX = -0.55,
      LY = 0.5,
      LZ = 0.66;

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = phaseRef.current;

      if (p === "hidden") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        raf = requestAnimationFrame(render);
        return;
      }

      // advance rotation
      if (flying.current) {
        const t = Math.min(1, (now - flyStart.current) / FLY_MS);
        lon0.current =
          flyFrom.current + (flyTarget.current - flyFrom.current) * easeInOutCubic(t);
        if (t >= 1) {
          flying.current = false;
          flyDoneRef.current();
        }
      } else if (p === "idle") {
        lon0.current += SPIN_PER_SEC * dt;
      }

      const theta = lon0.current;
      const cosT = Math.cos(theta),
        sinT = Math.sin(theta);
      const cosP = Math.cos(TILT),
        sinP = Math.sin(TILT);

      // radial burn-off frontier during the dissolve (normalized sphere radius)
      const burn = p === "dissolving" ? dissolveRef.current * 1.45 : 0;

      const w = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
      const h = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
      ctx.clearRect(0, 0, w, h);

      for (let row = 0; row < rows; row++) {
        const py = row * chh + chh / 2;
        const ny = (py - cy) / radius;
        if (ny < -1.05 || ny > 1.05) continue;
        for (let col = 0; col < cols; col++) {
          const px = col * cw + cw / 2;
          const nx = (px - cx) / radius;
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) continue;

          const rNorm = Math.sqrt(r2);
          // burn-off: glyphs inside the frontier have already vanished
          if (burn > 0 && rNorm < burn - 0.03) continue;

          const nz = Math.sqrt(1 - r2);
          // view-space normal (y-up)
          const Xv = nx,
            Yv = -ny,
            Zv = nz;

          // invert tilt (rotate -TILT about X)
          const y1 = Yv * cosP + Zv * sinP;
          const z1 = -Yv * sinP + Zv * cosP;
          // invert spin (rotate -theta about Y)
          const x = Xv * cosT - z1 * sinT;
          const z = Xv * sinT + z1 * cosT;
          const yy = y1;

          const lat = Math.asin(Math.max(-1, Math.min(1, yy))) / DEG;
          const lon = Math.atan2(x, z) / DEG;

          const land = isLand(lat, lon);

          // diffuse lighting + a touch of ambient
          let lum = Xv * LX + Yv * LY + Zv * LZ;
          lum = Math.max(0, lum) * 0.85 + 0.15;
          if (lum < 0.08) continue; // dark limb falls away into --void

          let glyph: string;
          let color: string;

          // the burn frontier glows in --signal (the apparatus reading the ground)
          if (burn > 0 && Math.abs(rNorm - burn) < 0.05) {
            glyph = "▓";
            color = C_SIGNAL;
          } else if (land) {
            const idx = Math.min(LAND.length - 1, Math.floor(lum * LAND.length));
            glyph = LAND[idx];
            color = lum > 0.62 ? C_BONE : C_BONE_DIM;
          } else {
            const idx = Math.min(OCEAN.length - 1, Math.floor(lum * OCEAN.length));
            glyph = OCEAN[idx];
            if (glyph === " ") continue;
            color = C_BONE_DIM;
          }

          // faint --signal rim-light on the leading (right) limb
          if (r2 > 0.9 && nx > 0) color = C_SIGNAL;

          ctx.fillStyle = color;
          ctx.globalAlpha = r2 > 0.9 ? 0.85 : 1;
          ctx.fillText(glyph, px, py);
          ctx.globalAlpha = 1;
        }
      }

      raf = requestAnimationFrame(render);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    />
  );
}
