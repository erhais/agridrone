import {
  bearingDeg,
  bearingToCompass,
  distanceMeters,
  nearestOnBoundary,
  nudgeLatLng,
  pointInZoneGeometry,
  type LatLng,
} from '../geoUtils';

// Carré unité en coordonnées [lng, lat].
const carre: number[][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

describe('pointInZoneGeometry', () => {
  it('Polygon : détecte un point intérieur', () => {
    const geom = { type: 'Polygon', coordinates: [carre] };
    expect(pointInZoneGeometry({ latitude: 0.5, longitude: 0.5 }, geom)).toBe(true);
  });

  it('Polygon : rejette un point extérieur', () => {
    const geom = { type: 'Polygon', coordinates: [carre] };
    expect(pointInZoneGeometry({ latitude: 2, longitude: 2 }, geom)).toBe(false);
  });

  it('MultiPolygon : intérieur à l’un des polygones', () => {
    const loin: number[][] = [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ];
    const geom = { type: 'MultiPolygon', coordinates: [[carre], [loin]] };
    expect(pointInZoneGeometry({ latitude: 10.5, longitude: 10.5 }, geom)).toBe(true);
    expect(pointInZoneGeometry({ latitude: 5, longitude: 5 }, geom)).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('renvoie 0 pour deux points identiques', () => {
    const p: LatLng = { latitude: 48.85, longitude: 2.35 };
    expect(distanceMeters(p, p)).toBe(0);
  });

  it('un degré de latitude vaut ~111,2 km', () => {
    const d = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(d).toBeCloseTo(111_195, -2); // à ±100 m près
  });
});

describe('bearingDeg', () => {
  const origine: LatLng = { latitude: 0, longitude: 0 };

  it('cap nord = 0°', () => {
    expect(bearingDeg(origine, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 5);
  });

  it('cap est = 90°', () => {
    expect(bearingDeg(origine, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 5);
  });

  it('renvoie toujours une valeur dans [0, 360)', () => {
    const sud = bearingDeg(origine, { latitude: -1, longitude: 0 });
    expect(sud).toBeGreaterThanOrEqual(0);
    expect(sud).toBeLessThan(360);
    expect(sud).toBeCloseTo(180, 5);
  });
});

describe('bearingToCompass', () => {
  it('mappe les caps cardinaux', () => {
    expect(bearingToCompass(0)).toBe('N');
    expect(bearingToCompass(45)).toBe('NE');
    expect(bearingToCompass(90)).toBe('E');
    expect(bearingToCompass(180)).toBe('S');
    expect(bearingToCompass(270)).toBe('O');
  });

  it('boucle à 360° vers N', () => {
    expect(bearingToCompass(360)).toBe('N');
  });
});

describe('nudgeLatLng', () => {
  it('déplace vers le nord d’environ 1° pour 111320 m', () => {
    const r = nudgeLatLng({ latitude: 0, longitude: 0 }, 111_320, 0);
    expect(r.latitude).toBeCloseTo(1, 5);
    expect(r.longitude).toBeCloseTo(0, 5);
  });

  it('un déplacement nul laisse le point inchangé', () => {
    const p: LatLng = { latitude: 45, longitude: 3 };
    const r = nudgeLatLng(p, 0, 0);
    expect(r).toEqual(p);
  });
});

describe('nearestOnBoundary', () => {
  it('projette un point extérieur sur l’arête la plus proche', () => {
    // Point à l’est du carré, à hauteur de latitude 0.5 → arête x=1.
    const { nearest, distanceM } = nearestOnBoundary({ latitude: 0.5, longitude: 2 }, carre);
    expect(nearest.longitude).toBeCloseTo(1, 5);
    expect(nearest.latitude).toBeCloseTo(0.5, 5);
    expect(distanceM).toBeGreaterThan(0);
  });
});
