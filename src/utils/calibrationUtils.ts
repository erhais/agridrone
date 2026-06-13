import type { CalibrationPoint } from '../services/machineProfileService';

/**
 * 1 point  → extrapolation proportionnelle
 *   vitesse : inverse  (+ de dose = moins vite)  v = v0 × d0 / d
 *   dosage  : direct   (+ de dose = + de réglage) r = r0 × d / d0
 *
 * 2 points → interpolation linéaire (fonctionne pour les deux modes
 *            si l'utilisateur a calibré correctement)
 */
export function computeTargetSetting(
  dose: number,
  points: CalibrationPoint[],
  mode: 'vitesse' | 'dosage',
): number | null {
  if (!points.length || dose <= 0) return null;

  if (points.length === 1) {
    const { dose: d0, valeur: v0 } = points[0];
    if (d0 <= 0) return null;
    const result = mode === 'vitesse' ? (v0 * d0) / dose : (v0 * dose) / d0;
    return Math.max(0, result);
  }

  const [p1, p2] = [...points].sort((a, b) => a.dose - b.dose);
  if (p2.dose === p1.dose) return null;
  const result = p1.valeur + ((dose - p1.dose) * (p2.valeur - p1.valeur)) / (p2.dose - p1.dose);
  return Math.max(0, result);
}

export function formatSetting(value: number, unite: string, mode: 'vitesse' | 'dosage'): string {
  const formatted = mode === 'vitesse' ? value.toFixed(1) : String(Math.round(value));
  return `${formatted} ${unite}`;
}
