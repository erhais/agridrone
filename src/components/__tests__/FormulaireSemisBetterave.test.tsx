import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireSemisBetterave from '../FormulaireSemisBetterave';
import {
  getSemisConditions,
  getSemisDefaults,
  postFormulairesSemis,
  putFormulairesSemis,
  type SemisCondition,
  type SemisDefaults,
  type SemisFormResponse,
} from '../../services/agridroneService';
import { ApiError } from '../../services/api';

// Service applicatif : lecture (conditions/defaults) ET écriture (post/put).
jest.mock('../../services/agridroneService', () => ({
  getSemisConditions: jest.fn(),
  getSemisDefaults: jest.fn(),
  postFormulairesSemis: jest.fn(),
  putFormulairesSemis: jest.fn(),
}));

// Picker natif neutralisé.
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

const mockConditions = getSemisConditions as jest.MockedFunction<typeof getSemisConditions>;
const mockDefaults = getSemisDefaults as jest.MockedFunction<typeof getSemisDefaults>;
const mockPost = postFormulairesSemis as jest.MockedFunction<typeof postFormulairesSemis>;
const mockPut = putFormulairesSemis as jest.MockedFunction<typeof putFormulairesSemis>;

const CONDITIONS: SemisCondition[] = [
  { id: 1, condition: 'Bonne' },
  { id: 2, condition: 'Passable' },
];

const ANNEE = new Date().getFullYear();

function response(over: Partial<SemisFormResponse> = {}): SemisFormResponse {
  return {
    id: 99, num_parcel: 1, doses_recalculees: true,
    zones_analysees: 0, zones_mises_a_jour: 0, zones_dosage_manuel: 0,
    ...over,
  };
}

function defaults(over: Partial<SemisDefaults> = {}): SemisDefaults {
  return {
    id: 42, nom: 'Betterave', id_culture: 7, annee_recolte: 2025,
    id_semis_condition_sol: 2, allow_dosage_manuel: true,
    commentaire: null, attributs: [],
    ...over,
  };
}

type Props = React.ComponentProps<typeof FormulaireSemisBetterave>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    idCulture: 7,
    cultureName: 'Betterave',
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConditions.mockResolvedValue(CONDITIONS);
  mockDefaults.mockResolvedValue(null);
  mockPost.mockResolvedValue(response());
  mockPut.mockResolvedValue(response());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ── Affichage & chargement ───────────────────────────────────────────────────

describe('FormulaireSemisBetterave — affichage', () => {
  it('affiche le titre semis/culture et la parcelle', async () => {
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    expect(screen.getByText('🌱 Semis — Betterave')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
  });

  it('charge conditions et defaults puis masque le loader', async () => {
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
    expect(mockConditions).toHaveBeenCalledTimes(1);
    expect(mockDefaults).toHaveBeenCalledWith(10, 7);
  });

  it('pré-remplit l’année depuis les defaults', async () => {
    mockDefaults.mockResolvedValue(defaults({ annee_recolte: 2025 }));
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    await waitFor(() => expect(screen.getByDisplayValue('2025')).toBeOnTheScreen());
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('FormulaireSemisBetterave — validation', () => {
  it('bloque l’enregistrement si l’année est vide', async () => {
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.changeText(screen.getByDisplayValue(String(ANNEE)), '');
    await fireEvent.press(screen.getByText('Enregistrer'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText('Champ obligatoire')).toBeOnTheScreen();
  });
});

// ── Création vs mise à jour ───────────────────────────────────────────────────

describe('FormulaireSemisBetterave — enregistrement', () => {
  it('crée le formulaire (POST) avec la charge utile attendue quand pas de defaults', async () => {
    mockDefaults.mockResolvedValue(null); // → 1ère condition sélectionnée, pas de formId
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith({
      id_parcel: 10,
      id_culture: 7,
      annee_recolte: ANNEE,
      id_semis_condition_sol: 1, // CONDITIONS[0]
      allow_dosage_manuel: false,
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('met à jour le formulaire existant (PUT) via l’id des defaults', async () => {
    mockDefaults.mockResolvedValue(defaults({ id: 42, allow_dosage_manuel: true }));
    await render(<FormulaireSemisBetterave {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut).toHaveBeenCalledWith(42, expect.objectContaining({
      id_parcel: 10,
      id_semis_condition_sol: 2,
      allow_dosage_manuel: true,
    }));
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ── Gestion des erreurs par statut ────────────────────────────────────────────

describe('FormulaireSemisBetterave — erreurs', () => {
  async function renderThenSave(props = baseProps()) {
    await render(<FormulaireSemisBetterave {...props} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
    await fireEvent.press(screen.getByText('Enregistrer'));
  }

  it('422 → alerte « Données invalides » avec le message', async () => {
    mockPost.mockRejectedValue(new ApiError(422, '422 — champ manquant'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Données invalides', '422 — champ manquant'));
  });

  it('500 → alerte « Erreur serveur » générique', async () => {
    mockPost.mockRejectedValue(new ApiError(500, '500 — boom'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur serveur', expect.any(String)));
  });

  it('autre statut → alerte « Erreur » avec le message', async () => {
    mockPost.mockRejectedValue(new ApiError(403, '403 — interdit'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', '403 — interdit'));
  });

  it('erreur non-API → alerte générique', async () => {
    mockPost.mockRejectedValue(new Error('réseau'));
    await renderThenSave();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', 'Impossible d\'enregistrer le formulaire.'));
  });
});
