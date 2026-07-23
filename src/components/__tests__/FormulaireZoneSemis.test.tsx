import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireZoneSemis from '../FormulaireZoneSemis';
import { getPierreReferentiel, patchZoneSemis, type PierreReferentielItem } from '../../services/agridroneService';
import { ApiError } from '../../services/api';

// getPierreCoef reste RÉEL (calcul de dose) ; seuls le référentiel et l'écriture sont mockés.
jest.mock('../../services/agridroneService', () => {
  const actual = jest.requireActual('../../services/agridroneService');
  return {
    ...actual,
    getPierreReferentiel: jest.fn(),
    patchZoneSemis: jest.fn(),
  };
});

jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

const mockPierreRef = getPierreReferentiel as jest.MockedFunction<typeof getPierreReferentiel>;
const mockPatch = patchZoneSemis as jest.MockedFunction<typeof patchZoneSemis>;

// Référentiel pierre trié par taux croissant (comme le backend).
const PIERRE: PierreReferentielItem[] = [
  { taux: 0, coef: 0 },
  { taux: 10, coef: 5 },
  { taux: 20, coef: 10 },
];

type Props = React.ComponentProps<typeof FormulaireZoneSemis>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    zone: {
      num_zone: 1,
      properties: {
        label: 'Argile',
        surface: 2.5,
        dose: 100,
        dose_base: 100,
        id_class: 1,
        tx_pierre: 10,
        element: 'S',
      },
    },
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    culture: { id: 1, nom: 'Blé' },
    allowDosageManuel: false,
    isEditeur: false,
    typeSols: [],
    onClose: jest.fn(),
    onSave: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPierreRef.mockResolvedValue(PIERRE);
  mockPatch.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ── Affichage ─────────────────────────────────────────────────────────────────

describe('FormulaireZoneSemis — affichage', () => {
  it('affiche l’en-tête zone/culture, la parcelle, la surface et le sol', async () => {
    await render(<FormulaireZoneSemis {...baseProps()} />);
    expect(screen.getByText('ZONE A — Semis Blé')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
    expect(screen.getByText('2.5 ha')).toBeOnTheScreen();
    expect(screen.getByText('Argile')).toBeOnTheScreen();
  });
});

// ── Calcul de dose en temps réel ──────────────────────────────────────────────

describe('FormulaireZoneSemis — calcul de dose', () => {
  it('applique le coefficient pierre à la dose de base (kg/q, 2 décimales)', async () => {
    // dose = dose_base(100) × (1 + coef(5%)) = 105.00 ; tx_pierre=10 → coef 5
    await render(<FormulaireZoneSemis {...baseProps()} />);
    await waitFor(() => expect(screen.getByDisplayValue('105.00')).toBeOnTheScreen());
    expect(screen.getByText(/coef\. pierre : \+5 %/)).toBeOnTheScreen();
  });

  it('arrondit et affiche gr/ha pour la betterave (culture.id=3)', async () => {
    await render(<FormulaireZoneSemis {...baseProps({
      culture: { id: 3, nom: 'Betterave' },
      zone: { num_zone: 2, properties: { label: 'Limon', surface: 1, dose: 100000, dose_base: 100000, id_class: 2, tx_pierre: 0, element: 'S' } },
    })} />);
    // coef 0 → dose = 100000 → arrondi entier
    await waitFor(() => expect(screen.getByDisplayValue('100000')).toBeOnTheScreen());
    expect(screen.getByText('gr/ha')).toBeOnTheScreen();
  });
});

// ── Personnalisation de la dose ───────────────────────────────────────────────

describe('FormulaireZoneSemis — personnalisation dose', () => {
  it('refuse la personnalisation et alerte si allowDosageManuel=false', async () => {
    await render(<FormulaireZoneSemis {...baseProps({ allowDosageManuel: false })} />);
    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    expect(Alert.alert).toHaveBeenCalledWith('Non autorisé', expect.any(String));
    expect(screen.getByPlaceholderText('0').props.editable).toBe(false);
  });

  it('autorise la saisie quand allowDosageManuel=true', async () => {
    await render(<FormulaireZoneSemis {...baseProps({ allowDosageManuel: true })} />);
    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    expect(screen.getByPlaceholderText('0').props.editable).toBe(true);
  });
});

// ── Enregistrement (patchZoneSemis) ───────────────────────────────────────────

describe('FormulaireZoneSemis — enregistrement', () => {
  it('envoie tx_pierre et perso_dose=false sans dose ni type de sol', async () => {
    await render(<FormulaireZoneSemis {...baseProps()} />);
    await waitFor(() => expect(screen.getByDisplayValue('105.00')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(1, { tx_pierre: 10, perso_dose: false });
  });

  it('inclut la dose personnalisée saisie quand perso_dose est coché', async () => {
    await render(<FormulaireZoneSemis {...baseProps({ allowDosageManuel: true })} />);
    await fireEvent.press(screen.getByText('Personnaliser la dose'));
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '123.45');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(1, { tx_pierre: 10, dose: 123.45, perso_dose: true });
  });

  it('inclut id_type_sol pour un éditeur', async () => {
    await render(<FormulaireZoneSemis {...baseProps({
      isEditeur: true,
      typeSols: [{ id: 5, nom: 'Argile' }, { id: 6, nom: 'Limon' }],
      zone: { num_zone: 1, properties: { label: 'Argile', surface: 2.5, dose: 100, dose_base: 100, id_class: 1, tx_pierre: 10, id_type_sol: 5, element: '0' } },
    })} />);
    await waitFor(() => expect(screen.getByDisplayValue('105.00')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(1, expect.objectContaining({ id_type_sol: 5 }));
  });
});

// ── Gestion des erreurs par statut ────────────────────────────────────────────

describe('FormulaireZoneSemis — erreurs', () => {
  async function renderThenSave() {
    await render(<FormulaireZoneSemis {...baseProps()} />);
    await waitFor(() => expect(screen.getByDisplayValue('105.00')).toBeOnTheScreen());
    await fireEvent.press(screen.getByText('Enregistrer'));
  }

  it('403 → « Non autorisé »', async () => {
    mockPatch.mockRejectedValue(new ApiError(403, 'interdit'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Non autorisé', expect.any(String)));
  });

  it('404 → « Zone introuvable »', async () => {
    mockPatch.mockRejectedValue(new ApiError(404, 'absente'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', 'Zone introuvable.'));
  });

  it('422 → info « Aucune modification »', async () => {
    mockPatch.mockRejectedValue(new ApiError(422, 'rien'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Info', 'Aucune modification à enregistrer.'));
  });

  it('erreur non-API → alerte générique', async () => {
    mockPatch.mockRejectedValue(new Error('réseau'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', 'Impossible d\'enregistrer la zone.'));
  });
});
