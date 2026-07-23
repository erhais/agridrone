import type { CalibrationPoint } from '@/services/machineProfileService';
import { computeTargetSetting, formatSetting } from '../calibrationUtils';

describe('computeTargetSetting', () => {
  it('renvoie null sans point de calibration', () => {
    expect(computeTargetSetting(100, [], 'vitesse')).toBeNull();
  });

  it('renvoie null pour une dose nulle ou négative', () => {
    const pts: CalibrationPoint[] = [{ dose: 50, valeur: 10 }];
    expect(computeTargetSetting(0, pts, 'dosage')).toBeNull();
    expect(computeTargetSetting(-5, pts, 'dosage')).toBeNull();
  });

  describe('1 point', () => {
    it('renvoie null si la dose de référence est <= 0', () => {
      const pts: CalibrationPoint[] = [{ dose: 0, valeur: 10 }];
      expect(computeTargetSetting(100, pts, 'vitesse')).toBeNull();
    });

    it('vitesse : inversement proportionnelle à la dose', () => {
      // v = v0 * d0 / dose = 10 * 50 / 100 = 5
      const pts: CalibrationPoint[] = [{ dose: 50, valeur: 10 }];
      expect(computeTargetSetting(100, pts, 'vitesse')).toBe(5);
    });

    it('dosage : directement proportionnel à la dose', () => {
      // r = v0 * dose / d0 = 10 * 100 / 50 = 20
      const pts: CalibrationPoint[] = [{ dose: 50, valeur: 10 }];
      expect(computeTargetSetting(100, pts, 'dosage')).toBe(20);
    });
  });

  describe('2 points', () => {
    const pts: CalibrationPoint[] = [
      { dose: 50, valeur: 10 },
      { dose: 150, valeur: 30 },
    ];

    it('interpole linéairement entre les deux points', () => {
      // à dose=100 : 10 + (100-50)*(30-10)/(150-50) = 10 + 10 = 20
      expect(computeTargetSetting(100, pts, 'vitesse')).toBe(20);
    });

    it('retrouve les valeurs exactes aux points de calibration', () => {
      expect(computeTargetSetting(50, pts, 'dosage')).toBe(10);
      expect(computeTargetSetting(150, pts, 'dosage')).toBe(30);
    });

    it('trie les points quel que soit leur ordre', () => {
      const desordre: CalibrationPoint[] = [
        { dose: 150, valeur: 30 },
        { dose: 50, valeur: 10 },
      ];
      expect(computeTargetSetting(100, desordre, 'vitesse')).toBe(20);
    });

    it('extrapole en dessous du premier point sans passer sous 0', () => {
      // à dose=0 l'interpolation donnerait 0 ; jamais négatif
      const result = computeTargetSetting(10, pts, 'vitesse');
      expect(result).not.toBeNull();
      expect(result as number).toBeGreaterThanOrEqual(0);
    });

    it('renvoie null si les deux points ont la même dose', () => {
      const memeDose: CalibrationPoint[] = [
        { dose: 50, valeur: 10 },
        { dose: 50, valeur: 30 },
      ];
      expect(computeTargetSetting(100, memeDose, 'vitesse')).toBeNull();
    });
  });
});

describe('formatSetting', () => {
  it('vitesse : une décimale + unité', () => {
    expect(formatSetting(5.25, 'km/h', 'vitesse')).toBe('5.3 km/h');
  });

  it('dosage : arrondi entier + unité', () => {
    expect(formatSetting(19.6, '%', 'dosage')).toBe('20 %');
  });
});
