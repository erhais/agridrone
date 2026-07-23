import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireSemisBle from '../FormulaireSemisBle';
import {
  getSemisConditionsSemis,
  getSemisDefaults,
  postFormulairesSemis,
  putFormulairesSemis,
  type SemisCondition,
  type SemisDefaults,
  type SemisFormResponse,
} from '../../services/agridroneService';

jest.mock('../../services/agridroneService', () => ({
  getSemisConditionsSemis: jest.fn(),
  getSemisDefaults: jest.fn(),
  postFormulairesSemis: jest.fn(),
  putFormulairesSemis: jest.fn(),
}));

jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

// DateTimePicker natif : bouton simulé qui renvoie une date fixe (2026-03-15).
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: { onChange: (e: { type: string }, d?: Date) => void }) =>
      React.createElement(
        Pressable,
        { testID: 'mock-datepicker', onPress: () => onChange({ type: 'set' }, new Date(2026, 2, 15)) },
        React.createElement(Text, null, 'date'),
      ),
  };
});

const mockConditions = getSemisConditionsSemis as jest.MockedFunction<typeof getSemisConditionsSemis>;
const mockDefaults = getSemisDefaults as jest.MockedFunction<typeof getSemisDefaults>;
const mockPost = postFormulairesSemis as jest.MockedFunction<typeof postFormulairesSemis>;
const mockPut = putFormulairesSemis as jest.MockedFunction<typeof putFormulairesSemis>;

const CONDITIONS: SemisCondition[] = [
  { id: 1, condition: '1. Bonne' },
  { id: 2, condition: '2. Passable' },
];

// Année par défaut selon la règle du composant (bascule en septembre).
const now = new Date();
const ANNEE_DEFAUT = now.getMonth() + 1 >= 9 ? now.getFullYear() + 1 : now.getFullYear();

function response(over: Partial<SemisFormResponse> = {}): SemisFormResponse {
  return {
    id: 99, num_parcel: 1, doses_recalculees: true,
    zones_analysees: 0, zones_mises_a_jour: 0, zones_dosage_manuel: 0,
    ...over,
  };
}

type Props = React.ComponentProps<typeof FormulaireSemisBle>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    idCulture: 7,
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
});

// ── Affichage & chargement ───────────────────────────────────────────────────

describe('FormulaireSemisBle — affichage', () => {
  it('affiche le titre Blé et la parcelle', async () => {
    await render(<FormulaireSemisBle {...baseProps()} />);
    expect(screen.getByText('🌾 Semis — Blé')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
  });

  it('charge les conditions de semis (céréales) et les defaults', async () => {
    await render(<FormulaireSemisBle {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
    expect(mockConditions).toHaveBeenCalledTimes(1);
    expect(mockDefaults).toHaveBeenCalledWith(10, 7);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('FormulaireSemisBle — validation', () => {
  it('exige date, PMG et taux de germination', async () => {
    await render(<FormulaireSemisBle {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByText('Champ obligatoire (YYYY-MM-DD)')).toBeOnTheScreen();
    // PMG et taux partagent le même message.
    expect(screen.getAllByText('Champ obligatoire').length).toBeGreaterThanOrEqual(2);
  });
});

// ── Sélection de date ─────────────────────────────────────────────────────────

describe('FormulaireSemisBle — date de semis', () => {
  it('renseigne la date via le sélecteur natif', async () => {
    await render(<FormulaireSemisBle {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Sélectionner une date…'));
    await fireEvent.press(screen.getByTestId('mock-datepicker'));

    expect(screen.getByText('2026-03-15')).toBeOnTheScreen();
  });
});

// ── Création & mise à jour ────────────────────────────────────────────────────

describe('FormulaireSemisBle — enregistrement', () => {
  it('crée le formulaire (POST) avec la charge utile blé, sans préférence si nulle', async () => {
    await render(<FormulaireSemisBle {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Sélectionner une date…'));
    await fireEvent.press(screen.getByTestId('mock-datepicker'));
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 45.5'), '45.5');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 95'), '95');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const payload = mockPost.mock.calls[0][0];
    expect(payload).toMatchObject({
      id_parcel: 10,
      id_culture: 7,
      date_semis: '2026-03-15',
      annee_recolte: ANNEE_DEFAUT,
      pmg: 45.5,
      taux_germination: 95,
      allow_dosage_manuel: false,
      id_semis_condition: 1,     // CONDITIONS[0]
      second_herbicide: false,
    });
    expect(payload).not.toHaveProperty('preference'); // 0 → omise
  });

  it('met à jour (PUT) et inclut la préférence non nulle issue des defaults', async () => {
    const defaults = {
      id: 42, nom: 'Blé', id_culture: 7, annee_recolte: ANNEE_DEFAUT,
      id_semis_condition_sol: 0, allow_dosage_manuel: true, commentaire: null, attributs: [],
      // Champs céréales lus via cast dans le composant :
      id_semis_condition: 2, date_semis: '2025-10-01', pmg: 44, taux_germination: 92, preference: 10,
    } as unknown as SemisDefaults;
    mockDefaults.mockResolvedValue(defaults);

    await render(<FormulaireSemisBle {...baseProps()} />);
    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());

    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut).toHaveBeenCalledWith(42, expect.objectContaining({
      date_semis: '2025-10-01',
      pmg: 44,
      taux_germination: 92,
      id_semis_condition: 2,
      allow_dosage_manuel: true,
      preference: 10,
    }));
    expect(mockPost).not.toHaveBeenCalled();
  });
});
