// Coarse procedural land/ocean mask for the ASCII globe.
// We avoid a network fetch for the globe itself (UI.md §4 says a coarse mask is
// fine) by approximating continents as a union of ellipses in lat/lon space.
// Blobby on purpose — it has to read as a *planet and a readout at once*.

interface Blob {
  lat: number; // center latitude
  lon: number; // center longitude
  rlat: number; // semi-axis in degrees latitude
  rlon: number; // semi-axis in degrees longitude
}

// Rough continental masses. Tuned to be recognizable as Earth at ASCII scale.
const LAND: Blob[] = [
  // North America
  { lat: 48, lon: -100, rlat: 22, rlon: 33 },
  { lat: 62, lon: -98, rlat: 16, rlon: 42 },
  { lat: 30, lon: -98, rlat: 12, rlon: 16 },
  { lat: 15, lon: -88, rlat: 10, rlon: 9 }, // Central America
  { lat: 72, lon: -40, rlat: 11, rlon: 17 }, // Greenland
  // South America
  { lat: -8, lon: -62, rlat: 18, rlon: 16 },
  { lat: -30, lon: -65, rlat: 16, rlon: 9 },
  // Europe
  { lat: 50, lon: 14, rlat: 13, rlon: 22 },
  { lat: 62, lon: 18, rlat: 9, rlon: 12 }, // Scandinavia
  // Africa
  { lat: 8, lon: 18, rlat: 22, rlon: 20 },
  { lat: -18, lon: 24, rlat: 16, rlon: 13 },
  // Asia
  { lat: 50, lon: 70, rlat: 24, rlon: 40 },
  { lat: 60, lon: 120, rlat: 20, rlon: 55 },
  { lat: 25, lon: 80, rlat: 13, rlon: 12 }, // India
  { lat: 30, lon: 110, rlat: 14, rlon: 20 }, // China
  { lat: 5, lon: 110, rlat: 11, rlon: 16 }, // SE Asia / Indonesia
  // Australia
  { lat: -25, lon: 134, rlat: 12, rlon: 19 },
  // Antarctica handled as a band below
];

function lonDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Returns true if (lat, lon) is land. lon in [-180,180], lat in [-90,90]. */
export function isLand(lat: number, lon: number): boolean {
  if (lat < -62) return true; // Antarctica ice band
  for (const b of LAND) {
    const dlat = (lat - b.lat) / b.rlat;
    const dlon = lonDelta(lon, b.lon) / b.rlon;
    if (dlat * dlat + dlon * dlon <= 1) return true;
  }
  return false;
}
