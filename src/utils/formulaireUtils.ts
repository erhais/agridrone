// Helpers de normalisation des valeurs de formulaire venant du backend.
//
// Le backend stocke -1 comme sentinelle « non renseigné » pour plusieurs colonnes
// numériques (rendement, teneur, dose, pH, id_culture, id_engrais_frequence…).
// Afficher « -1 » tel quel — ou laisser un Picker retomber sur son 1er item — induit
// l'utilisateur en erreur ; ces helpers ramènent la sentinelle à un état « vide ».

/**
 * Valeur numérique de champ texte : la sentinelle -1 (ou toute valeur négative),
 * `null`/`undefined` et la chaîne vide deviennent `''` (→ le champ affiche son
 * placeholder). Sinon la valeur est renvoyée en chaîne. `0` est une valeur légitime.
 */
export function champNumeriqueOuVide(v: number | string | null | undefined): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v) : v;
  if (s.trim() === '') return '';
  return Number(s) < 0 ? '' : s;
}

/**
 * Identifiant de Picker : la sentinelle -1 (ou 0/absent) devient `0`, ce qui
 * sélectionne l'item placeholder « — Sélectionner — » plutôt que la 1re entrée.
 */
export function pickerIdOuZero(id: number | null | undefined): number {
  return id != null && id > 0 ? id : 0;
}
