import type { Coords } from "../data/demo";

const DEG = Math.PI / 180;

/** Great-circle interpolation (slerp on the sphere) between two [lat,lon] points. */
export function greatCircle(a: Coords, b: Coords, steps = 64): Coords[] {
  const [lat1, lon1] = [a[0] * DEG, a[1] * DEG];
  const [lat2, lon2] = [b[0] * DEG, b[1] * DEG];

  // 3D unit vectors
  const v1 = [
    Math.cos(lat1) * Math.cos(lon1),
    Math.cos(lat1) * Math.sin(lon1),
    Math.sin(lat1),
  ];
  const v2 = [
    Math.cos(lat2) * Math.cos(lon2),
    Math.cos(lat2) * Math.sin(lon2),
    Math.sin(lat2),
  ];
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const omega = Math.acos(dot);
  const sinO = Math.sin(omega);

  const out: Coords[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x: number, y: number, z: number;
    if (sinO < 1e-6) {
      x = v1[0];
      y = v1[1];
      z = v1[2];
    } else {
      const s1 = Math.sin((1 - t) * omega) / sinO;
      const s2 = Math.sin(t * omega) / sinO;
      x = s1 * v1[0] + s2 * v2[0];
      y = s1 * v1[1] + s2 * v2[1];
      z = s1 * v1[2] + s2 * v2[2];
    }
    const lat = Math.atan2(z, Math.hypot(x, y)) / DEG;
    const lon = Math.atan2(y, x) / DEG;
    out.push([lat, lon]);
  }
  return out;
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
