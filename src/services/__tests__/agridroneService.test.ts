import { getPierreCoef, type PierreReferentielItem } from '../agridroneService';

// Référentiel trié par taux croissant (ordre renvoyé par le backend).
const referentiel: PierreReferentielItem[] = [
  { taux: 0, coef: 100 },
  { taux: 5, coef: 95 },
  { taux: 10, coef: 90 },
  { taux: 15, coef: 85 },
];

describe('getPierreCoef', () => {
  it('renvoie le coefficient exact sur un seuil', () => {
    expect(getPierreCoef(referentiel, 10)).toBe(90);
  });

  it('prend le plus grand seuil inférieur ou égal au taux', () => {
    expect(getPierreCoef(referentiel, 12)).toBe(90); // entre 10 et 15 → seuil 10
    expect(getPierreCoef(referentiel, 4)).toBe(100); // entre 0 et 5 → seuil 0
  });

  it('sature au dernier seuil pour un taux au-delà du référentiel', () => {
    expect(getPierreCoef(referentiel, 100)).toBe(85);
  });

  it('renvoie 0 pour un taux inférieur au premier seuil', () => {
    const sansZero: PierreReferentielItem[] = [{ taux: 5, coef: 95 }];
    expect(getPierreCoef(sansZero, 2)).toBe(0);
  });

  it('renvoie 0 pour un référentiel vide', () => {
    expect(getPierreCoef([], 10)).toBe(0);
  });
});
