import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AgriboxModal from '../AgriboxModal';
import {
  getConversionConsoles,
  getConversionStatus,
  lancerConversion,
  type ConversionConsole,
} from '../../services/agridroneService';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('../../services/agridroneService', () => ({
  getConversionConsoles: jest.fn(),
  getConversionStatus: jest.fn(),
  lancerConversion: jest.fn(),
}));

jest.mock('../../services/authService', () => ({ loadToken: jest.fn().mockResolvedValue('tok') }));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  downloadAsync: jest.fn(),
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn().mockResolvedValue(undefined) }));

const mockConsoles = getConversionConsoles as jest.MockedFunction<typeof getConversionConsoles>;
const mockStatus = getConversionStatus as jest.MockedFunction<typeof getConversionStatus>;
const mockLancer = lancerConversion as jest.MockedFunction<typeof lancerConversion>;
const mockGetInfo = FileSystem.getInfoAsync as jest.MockedFunction<typeof FileSystem.getInfoAsync>;

// Console A : deux formats (shp + isoxml) ; Console B : un seul (shp).
const CONSOLE_A: ConversionConsole = { id: 1, model: 'Trimble', format: 'shp.isoxml' };
const CONSOLE_B: ConversionConsole = { id: 2, model: 'John Deere', format: 'shp' };

type Props = React.ComponentProps<typeof AgriboxModal>;

function baseProps(over: Partial<Props> = {}): Props {
  return {
    visible: true,
    fileUri: 'file:///doc.zip',
    fileName: 'doc.zip',
    onClose: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConsoles.mockResolvedValue([CONSOLE_A, CONSOLE_B]);
  mockLancer.mockResolvedValue({ job_id: 'job1' });
  // @ts-expect-error mock partiel de FileInfo
  mockGetInfo.mockResolvedValue({ exists: true });
});

// ── Chargement → sélection ────────────────────────────────────────────────────

describe('AgriboxModal — chargement', () => {
  it('charge les consoles et affiche l’étape de sélection', async () => {
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('Terminal')).toBeOnTheScreen());
    expect(screen.getByText('Trimble')).toBeOnTheScreen();
    expect(screen.getByText('John Deere')).toBeOnTheScreen();
    // Formats agrégés en majuscules sur la carte console.
    expect(screen.getByText('SHP · ISOXML')).toBeOnTheScreen();
  });

  it('passe en erreur si le chargement des consoles échoue', async () => {
    mockConsoles.mockRejectedValue(new Error('réseau HS'));
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('réseau HS')).toBeOnTheScreen());
  });
});

// ── Sélection de format / ISOXML ──────────────────────────────────────────────

describe('AgriboxModal — formats', () => {
  it('affiche les chips de format quand la console en propose plusieurs', async () => {
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('Format de sortie')).toBeOnTheScreen());
    // Chips individuelles SHP / ISOXML.
    expect(screen.getByText('ISOXML')).toBeOnTheScreen();
  });

  it('révèle grille et unité produit après choix du format ISOXML', async () => {
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('ISOXML')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('ISOXML'));

    expect(screen.getByText('Taille de grille (m)')).toBeOnTheScreen();
    expect(screen.getByText('Unité produit')).toBeOnTheScreen();
  });
});

// ── Lancement de conversion ───────────────────────────────────────────────────

describe('AgriboxModal — conversion', () => {
  it('lance la conversion avec le format par défaut (sans grille/produit)', async () => {
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('Trimble')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Convertir'));

    await waitFor(() => expect(mockLancer).toHaveBeenCalledTimes(1));
    // (fileUri, fileName, consoleId, model, format, grid, produit)
    expect(mockLancer).toHaveBeenCalledWith('file:///doc.zip', 'doc.zip', 1, 'Trimble', 'shp', undefined, undefined);
    expect(screen.getByText('Envoi du fichier…')).toBeOnTheScreen();
  });

  it('transmet grille et unité produit pour le format ISOXML', async () => {
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('ISOXML')).toBeOnTheScreen());
    await fireEvent.press(screen.getByText('ISOXML'));
    await fireEvent.press(screen.getByText('6')); // taille de grille 6
    await fireEvent.press(screen.getByText('L/ha')); // unité produit → value '83'

    await fireEvent.press(screen.getByText('Convertir'));

    await waitFor(() => expect(mockLancer).toHaveBeenCalledTimes(1));
    expect(mockLancer).toHaveBeenCalledWith('file:///doc.zip', 'doc.zip', 1, 'Trimble', 'isoxml', '6', '83');
  });

  it('passe en erreur si le fichier est introuvable', async () => {
    // @ts-expect-error mock partiel de FileInfo
    mockGetInfo.mockResolvedValue({ exists: false });
    await render(<AgriboxModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('Trimble')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Convertir'));

    await waitFor(() => expect(screen.getByText(/Fichier introuvable/)).toBeOnTheScreen());
    expect(mockLancer).not.toHaveBeenCalled();
  });
});

// ── Polling du statut (faux timers) ───────────────────────────────────────────

describe('AgriboxModal — suivi de conversion', () => {
  it('affiche l’écran de succès quand le statut est prêt', async () => {
    jest.useFakeTimers();
    try {
      mockStatus.mockResolvedValue({
        message: 'Terminé', type: 'ok', done: true, download_ready: true, error: false, filename: 'out.zip',
      });
      await render(<AgriboxModal {...baseProps()} />);
      await waitFor(() => expect(screen.getByText('Trimble')).toBeOnTheScreen());
      await fireEvent.press(screen.getByText('Convertir'));
      await waitFor(() => expect(mockLancer).toHaveBeenCalled());

      // Avancer d'un cycle de polling (3 s) et laisser les promesses se résoudre.
      await jest.advanceTimersByTimeAsync(3000);

      await waitFor(() => expect(screen.getByText('Conversion terminée')).toBeOnTheScreen());
      expect(screen.getByText('Télécharger')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('passe en erreur si le statut remonte une erreur', async () => {
    jest.useFakeTimers();
    try {
      mockStatus.mockResolvedValue({
        message: 'Conversion échouée', type: 'err', done: true, download_ready: false, error: true,
      });
      await render(<AgriboxModal {...baseProps()} />);
      await waitFor(() => expect(screen.getByText('Trimble')).toBeOnTheScreen());
      await fireEvent.press(screen.getByText('Convertir'));
      await waitFor(() => expect(mockLancer).toHaveBeenCalled());

      await jest.advanceTimersByTimeAsync(3000);

      await waitFor(() => expect(screen.getByText('Conversion échouée')).toBeOnTheScreen());
    } finally {
      jest.useRealTimers();
    }
  });
});
