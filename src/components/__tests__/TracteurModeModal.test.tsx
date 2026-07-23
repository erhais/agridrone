import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import TracteurModeModal from '../TracteurModeModal';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockGet = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSet = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockDelete = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

type Props = React.ComponentProps<typeof TracteurModeModal>;

function baseProps(over: Partial<Props> = {}): Props {
  return { visible: true, onClose: jest.fn(), onSelect: jest.fn(), ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe('TracteurModeModal', () => {
  it('affiche les trois modes de conduite', async () => {
    await render(<TracteurModeModal {...baseProps()} />);
    expect(screen.getByText('Vers console')).toBeOnTheScreen();
    expect(screen.getByText('Conduite par vitesse')).toBeOnTheScreen();
    expect(screen.getByText('Conduite par dosage')).toBeOnTheScreen();
  });

  it('démarre sur le mode « vitesse » par défaut et efface la préférence', async () => {
    const onSelect = jest.fn();
    await render(<TracteurModeModal {...baseProps({ onSelect })} />);

    await fireEvent.press(screen.getByText('Démarrer'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('vitesse'));
    // « Mémoriser » non coché → suppression de la préférence.
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('sélectionne un autre mode avant de démarrer', async () => {
    const onSelect = jest.fn();
    await render(<TracteurModeModal {...baseProps({ onSelect })} />);

    await fireEvent.press(screen.getByText('Conduite par dosage'));
    await fireEvent.press(screen.getByText('Démarrer'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('dosage'));
  });

  it('mémorise le choix quand l’option est cochée', async () => {
    await render(<TracteurModeModal {...baseProps()} />);

    await fireEvent.press(screen.getByText('Mémoriser ce choix par défaut'));
    await fireEvent.press(screen.getByText('Démarrer'));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith('tracteur_mode_default', 'vitesse'));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('restaure la préférence mémorisée au chargement', async () => {
    mockGet.mockResolvedValue('dosage');
    const onSelect = jest.fn();
    await render(<TracteurModeModal {...baseProps({ onSelect })} />);

    // Le mode restauré est présélectionné et « Mémoriser » est actif → re-sauvegarde.
    await fireEvent.press(screen.getByText('Démarrer'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('dosage'));
    expect(mockSet).toHaveBeenCalledWith('tracteur_mode_default', 'dosage');
  });
});
