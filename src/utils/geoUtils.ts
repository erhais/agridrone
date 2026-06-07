export type LatLng = { latitude: number; longitude: number };

// ── Point-in-polygon (ray-casting) ──────────────────────────────────────────
// coords : tableau [lng, lat][]
function pipCoords(point: LatLng, coords: number[][]): boolean {
  let inside = false;
  const x = point.longitude, y = point.latitude;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInZoneGeometry(
  point: LatLng,
  geometry: { type: string; coordinates: number[][][] | number[][][][] },
): boolean {
  if (geometry.type === 'Polygon') {
    return pipCoords(point, (geometry.coordinates as number[][][])[0]);
  }
  // MultiPolygon
  return (geometry.coordinates as number[][][][]).some(poly => pipCoords(point, poly[0]));
}

// ── Haversine distance (mètres) ──────────────────────────────────────────────
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const aa =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

// ── Bearing (0-360°) et direction cardinale ──────────────────────────────────
export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
export function bearingToCompass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

// ── Déplacer un point de (dLat, dLng) en mètres ──────────────────────────────
const DEG_PER_METER_LAT = 1 / 111_320;
export function nudgeLatLng(
  p: LatLng,
  deltaLatM: number,
  deltaLngM: number,
): LatLng {
  const degPerMeterLng =
    DEG_PER_METER_LAT / Math.max(0.001, Math.cos((p.latitude * Math.PI) / 180));
  return {
    latitude: p.latitude + deltaLatM * DEG_PER_METER_LAT,
    longitude: p.longitude + deltaLngM * degPerMeterLng,
  };
}

// ── Point le plus proche sur un segment (espace lat/lng — précis pour < 200m) ─
function nearestOnSegment(point: LatLng, a: LatLng, b: LatLng): LatLng {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) / len2,
    ),
  );
  return { latitude: a.latitude + t * dy, longitude: a.longitude + t * dx };
}

// ── Point le plus proche sur la frontière d'un polygone ─────────────────────
export function nearestOnBoundary(
  point: LatLng,
  coords: number[][],
): { nearest: LatLng; distanceM: number } {
  let minDist = Infinity;
  let nearest: LatLng = { latitude: coords[0][1], longitude: coords[0][0] };
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const a: LatLng = { latitude: coords[j][1], longitude: coords[j][0] };
    const b: LatLng = { latitude: coords[i][1], longitude: coords[i][0] };
    const p = nearestOnSegment(point, a, b);
    const d = distanceMeters(point, p);
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return { nearest, distanceM: minDist };
}
