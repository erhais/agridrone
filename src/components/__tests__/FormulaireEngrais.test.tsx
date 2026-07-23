import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireEngrais, { type FormulaireData } from '../FormulaireEngrais';
import { getCultures, getFrequences, getPailleOptions } from '../../services/agridroneService';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Service applicatif : on contrôle les référentiels chargés au montage.
jest.mock('../../services/agridroneService', () => ({
  getCultures: jest.fn(),
  getFrequences: jest.fn(),
  getPailleOptions: jest.fn(),
}));

// Picker natif : rendu neutre (les Item ne sont pas interrogés dans ces tests).
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

// WebView Fertiorga : composant natif neutralisé.
jest.mock('react-native-webview', () => ({ WebView: () => null }));

const mockCultures = getCultures as jest.MockedFunction<typeof getCultures>;
const mockFrequences = getFrequences as jest.MockedFunction<typeof getFrequences>;
const mockPaille = getPailleOptions as jest.MockedFunction<typeof getPailleOptions>;

const CULTURES = [{ id: 5, nom: 'Blé', unite: 'q/ha' }, { id: 6, nom: 'Maïs' }];
const FREQUENCES = [{ id: 2, nom: 'Une fois' }, { id: 3, nom: 'Fractionné' }];
const PAILLES = [{ id: 1, nom: 'Enfouie' }, { id: 2, nom: 'Exportée' }];

const ANNEE = String(new Date().getFullYear());

type Props = React.ComponentProps<typeof FormulaireEngrais>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    element: 'P',
    initialData: null,
    onClose: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCultures.mockResolvedValue(CULTURES);
  mockFrequences.mockResolvedValue(FREQUENCES);
  mockPaille.mockResolvedValue(PAILLES);
});

// ── Affichage & chargement ───────────────────────────────────────────────────

describe('FormulaireEngrais — affichage', () => {
  it('affiche le titre de l’élément et la parcelle', async () => {
    await render(<FormulaireEngrais {...baseProps({ element: 'P' })} />);
    expect(screen.getByText('Engrais PHOSPHORE')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
  });

  it('retombe sur le code brut pour un élément inconnu', async () => {
    await render(<FormulaireEngrais {...baseProps({ element: 'ZZ' })} />);
    expect(screen.getByText('Engrais ZZ')).toBeOnTheScreen();
  });

  it('masque le loader une fois les référentiels chargés', async () => {
    await render(<FormulaireEngrais {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());
    expect(mockCultures).toHaveBeenCalledTimes(1);
  });
});

// ── Alimentation des valeurs par défaut depuis le service ─────────────────────

describe('FormulaireEngrais — référentiels', () => {
  it('renseigne culture / fréquence / paille avec le 1er élément chargé', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id_culture: 5,            // CULTURES[0]
      id_engrais_frequence: 2,  // FREQUENCES[0]
      paille: 1,                // PAILLES[0]
    }));
  });

  it('utilise le repli paille si l’endpoint renvoie une liste vide', async () => {
    mockPaille.mockResolvedValue([]);
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ paille: 1 })); // FALLBACK_PAILLE[0]
  });

  it('reste fonctionnel si un endpoint échoue (Promise rejetée)', async () => {
    mockCultures.mockRejectedValue(new Error('réseau'));
    await render(<FormulaireEngrais {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());
    // Pas de culture → validation bloquante testée ailleurs ; ici on vérifie juste l’absence de crash.
    expect(screen.getByText('Engrais PHOSPHORE')).toBeOnTheScreen();
  });
});

// ── Charge utile & valeurs par défaut ─────────────────────────────────────────

describe('FormulaireEngrais — enregistrement', () => {
  it('transmet la charge utile par défaut à onSave', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      annee_recolte: ANNEE,
      double_culture: false,
      obj_rendement: '90',
      rendement_specifique_zone: false,
      teneur_engrais: '100',
      dosage_manuel_zone: true,
      qte_deja_apportee: '0',
      visible_plan_fumure: true,
    }));
  });

  it('pré-remplit les champs depuis initialData', async () => {
    const initialData: FormulaireData = {
      annee_recolte: '2025',
      id_culture: 5,
      double_culture: false,
      id_engrais_frequence: 2,
      obj_rendement: '82',
      rendement_specifique_zone: true,
      teneur_engrais: '63',
      dosage_manuel_zone: false,
      qte_deja_apportee: '12',
      paille: 2,
      visible_plan_fumure: false,
    };
    await render(<FormulaireEngrais {...baseProps({ initialData })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    expect(screen.getByDisplayValue('2025')).toBeOnTheScreen();  // année
    expect(screen.getByDisplayValue('82')).toBeOnTheScreen();    // obj rendement
    expect(screen.getByDisplayValue('63')).toBeOnTheScreen();    // teneur
    expect(screen.getByDisplayValue('12')).toBeOnTheScreen();    // qté apportée
  });

  it('ne laisse pas le chargement des référentiels écraser la sélection initialData (régression)', async () => {
    // initialData pointe sur la 2ème culture/fréquence/paille, pas la première de la liste.
    const initialData: FormulaireData = {
      annee_recolte: '2025',
      id_culture: 6,               // CULTURES[1], ≠ CULTURES[0].id (5)
      double_culture: false,
      id_engrais_frequence: 3,     // FREQUENCES[1], ≠ FREQUENCES[0].id (2)
      obj_rendement: '82',
      rendement_specifique_zone: false,
      teneur_engrais: '63',
      dosage_manuel_zone: false,
      qte_deja_apportee: '12',
      paille: 2,                   // PAILLES[1], ≠ PAILLES[0].id (1)
      visible_plan_fumure: true,
    };
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ initialData, onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id_culture: 6,
      id_engrais_frequence: 3,
      paille: 2,
    }));
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('FormulaireEngrais — validation', () => {
  it('bloque l’enregistrement et affiche l’erreur si un champ obligatoire est vide', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    // Vider l’année de récolte (champ obligatoire).
    await fireEvent.changeText(screen.getByDisplayValue(ANNEE), '');
    await fireEvent.press(screen.getByText('Enregistrer'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Champ obligatoire')).toBeOnTheScreen();
  });
});

// ── Double culture ────────────────────────────────────────────────────────────

describe('FormulaireEngrais — double culture', () => {
  it('révèle les champs de 2ème culture et inclut obj_rendement2 dans la charge utile', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<FormulaireEngrais {...baseProps({ onSave })} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    expect(screen.queryByText(/Obj\. Rendement 2ème culture/)).toBeNull();

    await fireEvent.press(screen.getByText('Double culture'));
    expect(screen.getByText('2ème culture')).toBeOnTheScreen();
    expect(screen.getByText(/Obj\. Rendement 2ème culture/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload.double_culture).toBe(true);
    expect(payload.obj_rendement2).toBe('90');
    // id_culture2 non sélectionnée (0) → absente de la charge utile.
    expect(payload).not.toHaveProperty('id_culture2');
  });
});

// ── WebView Fertiorga ─────────────────────────────────────────────────────────

describe('FormulaireEngrais — calculateur Fertiorga', () => {
  it('ouvre puis ferme la modale WebView', async () => {
    await render(<FormulaireEngrais {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement des listes…')).toBeNull());

    expect(screen.queryByText('Fertiorga — ARVALIS')).toBeNull();
    await fireEvent.press(screen.getByText('Calculer'));
    expect(screen.getByText('Fertiorga — ARVALIS')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('✕'));
    await waitFor(() => expect(screen.queryByText('Fertiorga — ARVALIS')).toBeNull());
  });
});
