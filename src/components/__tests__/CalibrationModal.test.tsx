import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CalibrationModal from '../CalibrationModal';
import { deleteProfile, getProfiles, saveProfile, type MachineProfile } from '../../services/machineProfileService';

// Service de profils machine (SecureStore) : contrôlé par les tests.
jest.mock('../../services/machineProfileService', () => ({
  getProfiles: jest.fn(),
  saveProfile: jest.fn(),
  deleteProfile: jest.fn(),
}));

const mockGetProfiles = getProfiles as jest.MockedFunction<typeof getProfiles>;
const mockSaveProfile = saveProfile as jest.MockedFunction<typeof saveProfile>;
const mockDeleteProfile = deleteProfile as jest.MockedFunction<typeof deleteProfile>;

const NOW = 1_700_000_000_000;

function profil(over: Partial<MachineProfile> = {}): MachineProfile {
  return {
    id: 'a',
    nom: 'Amazone ZA-M',
    mode: 'vitesse',
    unite: 'km/h',
    points: [{ dose: 200, valeur: 8 }],
    updatedAt: NOW,
    ...over,
  };
}

type Props = React.ComponentProps<typeof CalibrationModal>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    mode: 'vitesse',
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProfiles.mockResolvedValue([]);
  mockSaveProfile.mockResolvedValue(undefined);
  mockDeleteProfile.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Affichage selon le mode ───────────────────────────────────────────────────

describe('CalibrationModal — mode', () => {
  it('affiche le libellé et les colonnes du mode vitesse', async () => {
    await render(<CalibrationModal {...baseProps({ mode: 'vitesse' })} />);
    expect(screen.getByText('Conduite par vitesse')).toBeOnTheScreen();
    expect(screen.getByText('Vitesse (km/h)')).toBeOnTheScreen();
  });

  it('affiche le libellé et les colonnes du mode dosage', async () => {
    await render(<CalibrationModal {...baseProps({ mode: 'dosage' })} />);
    expect(screen.getByText('Conduite par dosage')).toBeOnTheScreen();
    expect(screen.getByText('Réglage (%)')).toBeOnTheScreen();
  });
});

// ── Profils enregistrés ───────────────────────────────────────────────────────

describe('CalibrationModal — profils', () => {
  it('charge les profils du mode courant et affiche leurs puces', async () => {
    mockGetProfiles.mockResolvedValue([profil({ id: 'a', nom: 'Amazone' }), profil({ id: 'b', nom: 'Kuhn' })]);
    await render(<CalibrationModal {...baseProps({ mode: 'vitesse' })} />);
    await waitFor(() => expect(screen.getByText('Amazone')).toBeOnTheScreen());
    expect(screen.getByText('Kuhn')).toBeOnTheScreen();
    expect(mockGetProfiles).toHaveBeenCalledWith('vitesse');
  });

  it('n’affiche pas la section quand aucun profil n’existe', async () => {
    mockGetProfiles.mockResolvedValue([]);
    await render(<CalibrationModal {...baseProps()} />);
    expect(screen.queryByText('Profils enregistrés')).toBeNull();
  });

  it('applique un profil sélectionné dans les champs', async () => {
    mockGetProfiles.mockResolvedValue([
      profil({ id: 'a', nom: 'Amazone', points: [{ dose: 200, valeur: 8 }, { dose: 250, valeur: 6.5 }] }),
    ]);
    await render(<CalibrationModal {...baseProps()} />);
    await fireEvent.press(await screen.findByText('Amazone'));

    expect(screen.getByDisplayValue('200')).toBeOnTheScreen(); // dose1
    expect(screen.getByDisplayValue('8')).toBeOnTheScreen();   // val1
    expect(screen.getByDisplayValue('250')).toBeOnTheScreen(); // dose2 (2e point auto-affiché)
    expect(screen.getByDisplayValue('6.5')).toBeOnTheScreen(); // val2
  });

  it('propose « Nouveau » après sélection et réinitialise les champs', async () => {
    mockGetProfiles.mockResolvedValue([profil({ id: 'a', nom: 'Amazone' })]);
    await render(<CalibrationModal {...baseProps()} />);
    await fireEvent.press(await screen.findByText('Amazone'));
    expect(screen.getByDisplayValue('200')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Nouveau'));
    expect(screen.queryByDisplayValue('200')).toBeNull();
  });

  it('supprime un profil via appui long puis confirmation', async () => {
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Supprimer')?.onPress?.();
    });
    mockGetProfiles.mockResolvedValue([profil({ id: 'a', nom: 'Amazone' })]);
    await render(<CalibrationModal {...baseProps()} />);

    await fireEvent(await screen.findByText('Amazone'), 'longPress');

    await waitFor(() => expect(mockDeleteProfile).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('Amazone')).toBeNull());
  });
});

// ── Confirmation ──────────────────────────────────────────────────────────────

describe('CalibrationModal — confirmation', () => {
  it('« Démarrer » est désactivé tant qu’un point valide n’est pas saisi', async () => {
    const onConfirm = jest.fn();
    await render(<CalibrationModal {...baseProps({ onConfirm })} />);
    await fireEvent.press(screen.getByText('Démarrer'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirme avec un point unique (parsing virgule décimale)', async () => {
    const onConfirm = jest.fn();
    await render(<CalibrationModal {...baseProps({ mode: 'vitesse', onConfirm })} />);

    await fireEvent.changeText(screen.getByPlaceholderText('ex: 200'), '200');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 8.0'), '8,5');
    await fireEvent.press(screen.getByText('Démarrer'));

    expect(onConfirm).toHaveBeenCalledWith({
      points: [{ dose: 200, valeur: 8.5 }],
      unite: 'km/h',
      mode: 'vitesse',
    });
  });

  it('ajoute un 2e point valide et distinct', async () => {
    const onConfirm = jest.fn();
    await render(<CalibrationModal {...baseProps({ onConfirm })} />);

    await fireEvent.changeText(screen.getByPlaceholderText('ex: 200'), '200');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 8.0'), '8');
    await fireEvent.press(screen.getByText('Ajouter un 2e point de calibration'));
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 250'), '250');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 6.5'), '6');
    await fireEvent.press(screen.getByText('Démarrer'));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ dose: 200, valeur: 8 }, { dose: 250, valeur: 6 }],
    }));
  });

  it('ignore le 2e point si sa dose est identique au 1er', async () => {
    const onConfirm = jest.fn();
    await render(<CalibrationModal {...baseProps({ onConfirm })} />);

    await fireEvent.changeText(screen.getByPlaceholderText('ex: 200'), '200');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 8.0'), '8');
    await fireEvent.press(screen.getByText('Ajouter un 2e point de calibration'));
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 250'), '200'); // même dose
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 6.5'), '6');
    await fireEvent.press(screen.getByText('Démarrer'));

    const result = onConfirm.mock.calls[0][0];
    expect(result.points).toHaveLength(1);
  });

  it('sauvegarde un profil quand l’option est cochée et nommée', async () => {
    const onConfirm = jest.fn();
    await render(<CalibrationModal {...baseProps({ mode: 'dosage', onConfirm })} />);

    await fireEvent.changeText(screen.getByPlaceholderText('ex: 200'), '200');
    await fireEvent.changeText(screen.getByPlaceholderText('ex: 60'), '80');
    await fireEvent.press(screen.getByText('Sauvegarder comme profil machine'));
    await fireEvent.changeText(screen.getByPlaceholderText('Nom du profil (ex: Amazone ZA-M)'), 'Sulky');
    await fireEvent.press(screen.getByText('Démarrer'));

    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledTimes(1));
    expect(mockSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: String(NOW),         // pas de profil sélectionné → nouvel id horodaté
      nom: 'Sulky',
      mode: 'dosage',
      unite: '%',
      points: [{ dose: 200, valeur: 80 }],
    }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
