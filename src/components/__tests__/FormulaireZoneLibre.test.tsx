import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FormulaireZoneLibre from '../FormulaireZoneLibre';
import { patchZoneSemis } from '../../services/agridroneService';
import { ApiError } from '../../services/api';

jest.mock('../../services/agridroneService', () => ({ patchZoneSemis: jest.fn() }));

jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const Picker = ({ children }: { children?: React.ReactNode }) => React.createElement('picker', null, children);
  Picker.Item = () => null;
  return { Picker };
});

const mockPatch = patchZoneSemis as jest.MockedFunction<typeof patchZoneSemis>;

type Props = React.ComponentProps<typeof FormulaireZoneLibre>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    zone: {
      num_zone: 1,
      properties: { label: 'Argile', surface: 2.5, dose: 50, id_class: 1, element: 'Z' },
      style: { fillColor: '#8BC34A' },
    },
    parcelle: { id: 10, nom: 'Les Grandes Terres' },
    fertilisant: 'Z',
    isEditeur: false,
    typeSols: [],
    onClose: jest.fn(),
    onSave: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPatch.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ── Affichage ─────────────────────────────────────────────────────────────────

describe('FormulaireZoneLibre — affichage', () => {
  it('affiche l’en-tête (zone + mode), la parcelle, la surface et le sol', async () => {
    await render(<FormulaireZoneLibre {...baseProps()} />);
    expect(screen.getByText('ZONE A — Zonage libre')).toBeOnTheScreen();
    expect(screen.getByText('Les Grandes Terres')).toBeOnTheScreen();
    expect(screen.getByText('2.5 ha')).toBeOnTheScreen();
    expect(screen.getByText('Argile')).toBeOnTheScreen();
  });

  it('pré-remplit la dose depuis les propriétés de la zone', async () => {
    await render(<FormulaireZoneLibre {...baseProps()} />);
    expect(screen.getByDisplayValue('50')).toBeOnTheScreen();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('FormulaireZoneLibre — validation', () => {
  it('refuse une dose négative', async () => {
    await render(<FormulaireZoneLibre {...baseProps()} />);
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '-5');
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(Alert.alert).toHaveBeenCalledWith('Valeur invalide', expect.any(String));
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('refuse une dose vide (non numérique)', async () => {
    await render(<FormulaireZoneLibre {...baseProps()} />);
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '');
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(Alert.alert).toHaveBeenCalledWith('Valeur invalide', expect.any(String));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

// ── Enregistrement ────────────────────────────────────────────────────────────

describe('FormulaireZoneLibre — enregistrement', () => {
  it('patche la zone avec perso_dose et le fertilisant', async () => {
    await render(<FormulaireZoneLibre {...baseProps()} />);
    await fireEvent.changeText(screen.getByPlaceholderText('0'), '42');
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      1,
      { tx_pierre: 0, dose: 42, perso_dose: true },
      'Z',
    );
  });

  it('transmet un fertilisant personnalisé', async () => {
    await render(<FormulaireZoneLibre {...baseProps({ fertilisant: 'K' })} />);
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch.mock.calls[0][2]).toBe('K');
  });

  it('inclut id_type_sol pour un éditeur', async () => {
    await render(<FormulaireZoneLibre {...baseProps({
      isEditeur: true,
      typeSols: [{ id: 5, nom: 'Argile' }],
      zone: { num_zone: 1, properties: { label: 'Argile', surface: 2.5, dose: 50, id_class: 1, id_type_sol: 5, element: '0' } },
    })} />);
    await fireEvent.press(screen.getByText('Enregistrer'));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
    expect(mockPatch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ id_type_sol: 5, perso_dose: true }),
      'Z',
    );
  });
});

// ── Erreurs ───────────────────────────────────────────────────────────────────

describe('FormulaireZoneLibre — erreurs', () => {
  it('ApiError → alerte avec le message', async () => {
    mockPatch.mockRejectedValue(new ApiError(500, '500 — boom'));
    await render(<FormulaireZoneLibre {...baseProps()} />);
    await fireEvent.press(screen.getByText('Enregistrer'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', '500 — boom'));
  });

  it('erreur non-API → alerte générique', async () => {
    mockPatch.mockRejectedValue(new Error('réseau'));
    await render(<FormulaireZoneLibre {...baseProps()} />);
    await fireEvent.press(screen.getByText('Enregistrer'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Erreur', 'Impossible d\'enregistrer.'));
  });
});
