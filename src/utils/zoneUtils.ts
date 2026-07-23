import type { ZoneDetail } from '@/services/agridroneService';
import { pointInZoneGeometry, type LatLng } from './geoUtils';

type Geometry = { type: string; coordinates: number[][][] | number[][][][] };

/** Tous les sommets d'une géométrie Polygon/MultiPolygon (anneaux extérieurs). */
function sommets(geometry: Geometry): LatLng[] {
  const anneaux: number[][][] =
    geometry.type === 'Polygon'
      ? [(geometry.coordinates as number[][][])[0]]
      : (geometry.coordinates as number[][][][]).map(poly => poly[0]);
  return anneaux
    .filter(Boolean)
    .flat()
    .map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

/** Centroïde fourni par l'API, sinon barycentre des sommets. */
function centroideZone(zone: ZoneDetail): LatLng | null {
  if (zone.centroid) {
    return { latitude: zone.centroid.lat, longitude: zone.centroid.lng };
  }
  if (!zone.geometry) return null;
  const pts = sommets(zone.geometry as Geometry);
  if (pts.length === 0) return null;
  return {
    latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length,
    longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length,
  };
}

/**
 * Part des sommets d'une zone situés dans la parcelle (0 → 1).
 *
 * ⚠ Indicateur volontairement secondaire : les zones pavent la parcelle, donc
 * beaucoup de leurs sommets tombent exactement sur le contour, et le test
 * point-dans-polygone les classe alors comme extérieurs. Une zone d'angle
 * pourtant intégralement contenue peut ainsi tomber sous 0,5. Ne jamais s'en
 * servir seul — il ne sert qu'à corroborer un centroïde hors parcelle.
 */
export function tauxSommetsDedans(zoneGeom: Geometry, parcelleGeom: Geometry): number {
  const pts = sommets(zoneGeom);
  if (pts.length === 0) return 1;
  return pts.filter(p => pointInZoneGeometry(p, parcelleGeom)).length / pts.length;
}

/** Seuil de corroboration, appliqué uniquement si le centroïde est hors parcelle. */
export const SEUIL_SOMMETS = 0.5;

export interface CoherenceZones {
  /** false dès qu'une zone n'appartient pas à la parcelle sélectionnée. */
  coherent: boolean;
  /** Nombre de zones hors parcelle. */
  nbHorsParcelle: number;
}

/**
 * Vérifie que les zones reçues appartiennent bien à la parcelle sélectionnée.
 *
 * L'API a déjà renvoyé les zones d'une autre parcelle (colonne `zones_geom.id_parcel`
 * erronée, sur laquelle porte justement le filtre serveur). Afficher ces doses serait
 * dangereux — un épandage peut être réalisé sur la base de ce qui est affiché.
 *
 * Critère : le centroïde de la zone doit tomber dans la parcelle. Vérifié sur les
 * 284 zones du dépôt dla — 100 % des zones légitimes le respectent, y compris celles
 * dont la surface déborde jusqu'à 44 % (effets de bord du découpage). Une zone
 * étrangère, elle, est à l'opposé du champ.
 *
 * Le ratio de sommets ne sert que de garde-fou supplémentaire, pour le cas d'une zone
 * très concave dont le centroïde tomberait hors de sa propre surface.
 *
 * Prudence volontaire : si la vérification est impossible (géométrie de parcelle ou
 * centroïde absents), la zone est considérée cohérente plutôt que bloquée à tort.
 */
export function verifierCoherenceZones(
  zones: ZoneDetail[],
  parcelleGeom: Geometry | null | undefined,
): CoherenceZones {
  if (!parcelleGeom || zones.length === 0) {
    return { coherent: true, nbHorsParcelle: 0 };
  }
  let hors = 0;
  for (const zone of zones) {
    const centre = centroideZone(zone);
    if (!centre) continue;
    if (pointInZoneGeometry(centre, parcelleGeom)) continue;
    // Centroïde dehors : corroborer avant d'accuser la zone.
    const taux = zone.geometry
      ? tauxSommetsDedans(zone.geometry as Geometry, parcelleGeom)
      : 0;
    if (taux < SEUIL_SOMMETS) hors++;
  }
  return { coherent: hors === 0, nbHorsParcelle: hors };
}
