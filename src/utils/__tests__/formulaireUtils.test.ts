import { champNumeriqueOuVide, pickerIdOuZero } from '../formulaireUtils';

describe('champNumeriqueOuVide', () => {
  it('ramène la sentinelle -1 à une chaîne vide', () => {
    expect(champNumeriqueOuVide(-1)).toBe('');
    expect(champNumeriqueOuVide('-1')).toBe('');
  });

  it('ramène toute valeur négative à une chaîne vide', () => {
    expect(champNumeriqueOuVide(-42)).toBe('');
    expect(champNumeriqueOuVide('-0.5')).toBe('');
  });

  it('traite null / undefined comme vide', () => {
    expect(champNumeriqueOuVide(null)).toBe('');
    expect(champNumeriqueOuVide(undefined)).toBe('');
  });

  it('traite la chaîne vide ou blanche comme vide', () => {
    expect(champNumeriqueOuVide('')).toBe('');
    expect(champNumeriqueOuVide('   ')).toBe('');
  });

  it('conserve 0 comme valeur légitime', () => {
    expect(champNumeriqueOuVide(0)).toBe('0');
    expect(champNumeriqueOuVide('0')).toBe('0');
  });

  it('renvoie les valeurs positives en chaîne', () => {
    expect(champNumeriqueOuVide(12)).toBe('12');
    expect(champNumeriqueOuVide('7.5')).toBe('7.5');
  });
});

describe('pickerIdOuZero', () => {
  it('renvoie 0 pour la sentinelle -1', () => {
    expect(pickerIdOuZero(-1)).toBe(0);
  });

  it('renvoie 0 pour 0, null et undefined', () => {
    expect(pickerIdOuZero(0)).toBe(0);
    expect(pickerIdOuZero(null)).toBe(0);
    expect(pickerIdOuZero(undefined)).toBe(0);
  });

  it('conserve un identifiant strictement positif', () => {
    expect(pickerIdOuZero(3)).toBe(3);
    expect(pickerIdOuZero(1)).toBe(1);
  });
});
