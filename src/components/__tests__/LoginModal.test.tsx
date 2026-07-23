import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LoginModal from '../LoginModal';
import {
  fetchRepositories,
  fetchToken,
  saveSession,
  type AuthRepository,
} from '../../services/authService';

jest.mock('../../services/authService', () => ({
  fetchRepositories: jest.fn(),
  fetchToken: jest.fn(),
  saveSession: jest.fn(),
  clearSession: jest.fn(),
}));

// Modale enfant isolée (elle a sa propre logique testée séparément).
jest.mock('../ForgotPasswordModal', () => ({ __esModule: true, default: () => null }));

const mockFetchRepos = fetchRepositories as jest.MockedFunction<typeof fetchRepositories>;
const mockFetchToken = fetchToken as jest.MockedFunction<typeof fetchToken>;
const mockSaveSession = saveSession as jest.MockedFunction<typeof saveSession>;

const REPO_A: AuthRepository = { cle: 'depot1', label: 'Exploitation Nord' };
const REPO_B: AuthRepository = { cle: 'depot2', label: 'Exploitation Sud' };

function tokenResponse() {
  return { access_token: 'tok', expires_in: 3600, nom: 'Dupont', prenom: 'Jean' };
}

async function fillCredentials() {
  await fireEvent.changeText(screen.getByPlaceholderText('Identifiant'), 'jean');
  await fireEvent.changeText(screen.getByPlaceholderText('Mot de passe'), 'secret');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchToken.mockResolvedValue(tokenResponse());
  mockSaveSession.mockResolvedValue(undefined);
});

// ── Étape identifiants ────────────────────────────────────────────────────────

describe('LoginModal — identifiants', () => {
  it('affiche le formulaire de connexion', async () => {
    await render(<LoginModal onSuccess={jest.fn()} />);
    expect(screen.getByText('Connexion')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Identifiant')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Mot de passe')).toBeOnTheScreen();
    expect(screen.getByText('Continuer')).toBeOnTheScreen();
  });

  it('refuse la soumission si un champ est vide', async () => {
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fireEvent.press(screen.getByText('Continuer'));
    expect(screen.getByText('Veuillez remplir tous les champs.')).toBeOnTheScreen();
    expect(mockFetchRepos).not.toHaveBeenCalled();
  });

  it('affiche l’erreur d’authentification renvoyée par le service', async () => {
    mockFetchRepos.mockRejectedValue(new Error('Identifiant ou mot de passe incorrect.'));
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));
    await waitFor(() =>
      expect(screen.getByText('Identifiant ou mot de passe incorrect.')).toBeOnTheScreen(),
    );
  });
});

// ── Aiguillage selon le nombre de dépôts ──────────────────────────────────────

describe('LoginModal — dépôts', () => {
  it('passe à l’étape « Choisir un projet » avec plusieurs dépôts', async () => {
    mockFetchRepos.mockResolvedValue([REPO_A, REPO_B]);
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));

    await waitFor(() => expect(screen.getByText('Choisir un projet')).toBeOnTheScreen());
    expect(screen.getByText('Exploitation Nord')).toBeOnTheScreen();
    expect(screen.getByText('Exploitation Sud')).toBeOnTheScreen();
    expect(mockFetchToken).not.toHaveBeenCalled(); // pas encore de token
  });

  it('enchaîne automatiquement token + session avec un seul dépôt', async () => {
    mockFetchRepos.mockResolvedValue([REPO_A]);
    const onSuccess = jest.fn();
    await render(<LoginModal onSuccess={onSuccess} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockFetchToken).toHaveBeenCalledWith('jean', 'secret', 'depot1');
    expect(mockSaveSession).toHaveBeenCalledWith('tok', 3600, 'jean', 'secret', 'depot1', true, 'Dupont', 'Jean');
  });

  it('affiche l’écran « Aucun projet » quand aucun dépôt', async () => {
    mockFetchRepos.mockResolvedValue([]);
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));

    await waitFor(() => expect(screen.getByText('Aucun projet Agridrone')).toBeOnTheScreen());
    expect(screen.getByText(/Déconnexion dans 5s/)).toBeOnTheScreen();
  });
});

// ── Sélection de dépôt & session ──────────────────────────────────────────────

describe('LoginModal — sélection de dépôt', () => {
  it('obtient un token pour le dépôt choisi puis appelle onSuccess', async () => {
    mockFetchRepos.mockResolvedValue([REPO_A, REPO_B]);
    const onSuccess = jest.fn();
    await render(<LoginModal onSuccess={onSuccess} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));
    await waitFor(() => expect(screen.getByText('Exploitation Sud')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Exploitation Sud'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockFetchToken).toHaveBeenCalledWith('jean', 'secret', 'depot2');
  });

  it('« Se souvenir de moi » décoché → session non mémorisée', async () => {
    mockFetchRepos.mockResolvedValue([REPO_A]);
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Se souvenir de moi (30 jours)'));
    await fireEvent.press(screen.getByText('Continuer'));

    await waitFor(() => expect(mockSaveSession).toHaveBeenCalledTimes(1));
    expect(mockSaveSession.mock.calls[0][5]).toBe(false); // rememberMe
  });

  it('le bouton Retour ramène à l’étape identifiants', async () => {
    mockFetchRepos.mockResolvedValue([REPO_A, REPO_B]);
    await render(<LoginModal onSuccess={jest.fn()} />);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Continuer'));
    await waitFor(() => expect(screen.getByText('Choisir un projet')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('← Retour'));
    expect(screen.getByText('Connexion')).toBeOnTheScreen();
  });
});
