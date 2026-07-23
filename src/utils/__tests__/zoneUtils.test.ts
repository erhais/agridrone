import type { ZoneDetail } from '@/services/agridroneService';
import { SEUIL_SOMMETS, tauxSommetsDedans, verifierCoherenceZones } from '../zoneUtils';

// Parcelle : grand carré [lng, lat] de 0 à 10.
const parcelle = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

// Petit carré paramétrable (côté 1) centré autour de (cx, cy) en [lng, lat].
function petitCarre(cx: number, cy: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [cx - 0.5, cy - 0.5],
        [cx + 0.5, cy - 0.5],
        [cx + 0.5, cy + 0.5],
        [cx - 0.5, cy + 0.5],
        [cx - 0.5, cy - 0.5],
      ],
    ],
  };
}

function zone(partial: Partial<ZoneDetail>): ZoneDetail {
  return { id: 'z', properties: null, style: null, ...partial } as ZoneDetail;
}

describe('tauxSommetsDedans', () => {
  it('renvoie 1 pour une zone entièrement contenue', () => {
    expect(tauxSommetsDedans(petitCarre(5, 5), parcelle)).toBe(1);
  });

  it('renvoie 0 pour une zone entièrement à l’extérieur', () => {
    expect(tauxSommetsDedans(petitCarre(50, 50), parcelle)).toBe(0);
  });

  it('renvoie 1 pour une géométrie sans sommet (garde-fou)', () => {
    const vide = { type: 'Polygon' as const, coordinates: [[]] };
    expect(tauxSommetsDedans(vide, parcelle)).toBe(1);
  });
});

describe('SEUIL_SOMMETS', () => {
  it('vaut 0,5', () => {
    expect(SEUIL_SOMMETS).toBe(0.5);
  });
});

describe('verifierCoherenceZones', () => {
  it('cohérent si la géométrie de parcelle est absente (prudence)', () => {
    const zones = [zone({ centroid: { lat: 100, lng: 100 } })];
    expect(verifierCoherenceZones(zones, null)).toEqual({ coherent: true, nbHorsParcelle: 0 });
    expect(verifierCoherenceZones(zones, undefined)).toEqual({ coherent: true, nbHorsParcelle: 0 });
  });

  it('cohérent pour une liste de zones vide', () => {
    expect(verifierCoherenceZones([], parcelle)).toEqual({ coherent: true, nbHorsParcelle: 0 });
  });

  it('accepte une zone dont le centroïde fourni tombe dans la parcelle', () => {
    const zones = [zone({ centroid: { lat: 5, lng: 5 }, geometry: petitCarre(5, 5) })];
    expect(verifierCoherenceZones(zones, parcelle)).toEqual({ coherent: true, nbHorsParcelle: 0 });
  });

  it('calcule le centroïde depuis la géométrie quand centroid est absent', () => {
    const zones = [zone({ geometry: petitCarre(3, 3) })];
    expect(verifierCoherenceZones(zones, parcelle).coherent).toBe(true);
  });

  it('détecte une zone étrangère (centroïde et sommets hors parcelle)', () => {
    const zones = [zone({ centroid: { lat: 50, lng: 50 }, geometry: petitCarre(50, 50) })];
    expect(verifierCoherenceZones(zones, parcelle)).toEqual({ coherent: false, nbHorsParcelle: 1 });
  });

  it('ne bloque pas une zone dont le centroïde déborde mais les sommets restent dedans', () => {
    // Centroïde annoncé hors parcelle mais géométrie majoritairement dedans → corroboration.
    const zones = [zone({ centroid: { lat: 50, lng: 50 }, geometry: petitCarre(5, 5) })];
    expect(verifierCoherenceZones(zones, parcelle).coherent).toBe(true);
  });

  it('ignore une zone sans centroïde ni géométrie (non vérifiable)', () => {
    const zones = [zone({})];
    expect(verifierCoherenceZones(zones, parcelle)).toEqual({ coherent: true, nbHorsParcelle: 0 });
  });

  it('compte plusieurs zones hors parcelle', () => {
    const zones = [
      zone({ centroid: { lat: 50, lng: 50 }, geometry: petitCarre(50, 50) }),
      zone({ centroid: { lat: 5, lng: 5 }, geometry: petitCarre(5, 5) }),
      zone({ centroid: { lat: 80, lng: 80 }, geometry: petitCarre(80, 80) }),
    ];
    expect(verifierCoherenceZones(zones, parcelle)).toEqual({ coherent: false, nbHorsParcelle: 2 });
  });
});
