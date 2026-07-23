import * as SecureStore from 'expo-secure-store';
import {
  clearSession,
  fetchRepositories,
  fetchToken,
  getStoredCredentials,
  loadToken,
  refreshToken,
  saveSession,
  switchRepository,
} from '../authService';

jest.mock('expo-secure-store');

// ── Store SecureStore en mémoire ────────────────────────────────────────────
let store: Map<string, string>;

const mockGet = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSet = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockDelete = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

const NOW = 1_700_000_000_000; // instant de référence figé

beforeEach(() => {
  store = new Map();
  jest.clearAllMocks();
  mockGet.mockImplementation(async (k: string) => store.get(k) ?? null);
  mockSet.mockImplementation(async (k: string, v: string) => { store.set(k, v); });
  mockDelete.mockImplementation(async (k: string) => { store.delete(k); });
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
  // @ts-expect-error nettoyage du mock fetch global
  global.fetch = undefined;
});

function mockFetchOnce(ok: boolean, body: unknown, status = ok ? 200 : 400) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

// ── saveSession + loadToken ─────────────────────────────────────────────────

describe('saveSession / loadToken', () => {
  it('stocke le token et le renvoie tant qu’il n’est pas expiré', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1');
    await expect(loadToken()).resolves.toBe('tok');
  });

  it('renvoie null quand le token est expiré', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1');
    (Date.now as jest.Mock).mockReturnValue(NOW + 3600_000 + 1); // au-delà de l’expiration
    await expect(loadToken()).resolves.toBeNull();
  });

  it('renvoie null si aucun token n’est stocké', async () => {
    await expect(loadToken()).resolves.toBeNull();
  });

  it('rememberMe=true mémorise le mot de passe et une expiration 30 j', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', true);
    expect(store.get('agridrone_password')).toBe('secret');
    expect(store.has('agridrone_creds_expiry')).toBe(true);
  });

  it('rememberMe=false n’enregistre pas le mot de passe', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', false);
    expect(store.has('agridrone_password')).toBe(false);
    expect(store.has('agridrone_creds_expiry')).toBe(false);
  });

  it('stocke nom/prénom quand fournis, et les efface sinon', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', false, 'Dupont', 'Jean');
    expect(store.get('agridrone_nom')).toBe('Dupont');
    expect(store.get('agridrone_prenom')).toBe('Jean');

    await saveSession('tok', 3600, 'jean', 'secret', 'depot1'); // nom/prenom par défaut null
    expect(store.has('agridrone_nom')).toBe(false);
    expect(store.has('agridrone_prenom')).toBe(false);
  });
});

// ── getStoredCredentials ────────────────────────────────────────────────────

describe('getStoredCredentials', () => {
  it('renvoie null sans identifiant mémorisé', async () => {
    await expect(getStoredCredentials()).resolves.toBeNull();
  });

  it('renvoie login/repository/nom/prénom mémorisés', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', false, 'Dupont', 'Jean');
    await expect(getStoredCredentials()).resolves.toEqual({
      login: 'jean',
      repository: 'depot1',
      nom: 'Dupont',
      prenom: 'Jean',
    });
  });
});

// ── clearSession ────────────────────────────────────────────────────────────

describe('clearSession', () => {
  it('efface toutes les clés de session', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', true, 'Dupont', 'Jean');
    await clearSession();
    expect(store.size).toBe(0);
  });
});

// ── refreshToken ────────────────────────────────────────────────────────────

describe('refreshToken', () => {
  it('renvoie null en l’absence d’identifiants mémorisés', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', false); // pas de password stocké
    await expect(refreshToken()).resolves.toBeNull();
  });

  it('efface la session et renvoie null si la mémorisation 30 j a expiré', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', true);
    (Date.now as jest.Mock).mockReturnValue(NOW + 31 * 24 * 3600_000); // > 30 jours
    await expect(refreshToken()).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it('rafraîchit le token via fetchToken et le persiste', async () => {
    await saveSession('vieuxtok', 3600, 'jean', 'secret', 'depot1', true);
    mockFetchOnce(true, { access_token: 'neuf', expires_in: 3600, nom: 'Dupont', prenom: 'Jean' });
    await expect(refreshToken()).resolves.toBe('neuf');
    expect(store.get('agridrone_access_token')).toBe('neuf');
  });

  it('renvoie null si le rafraîchissement réseau échoue', async () => {
    await saveSession('vieuxtok', 3600, 'jean', 'secret', 'depot1', true);
    global.fetch = jest.fn().mockRejectedValue(new Error('réseau')) as unknown as typeof fetch;
    await expect(refreshToken()).resolves.toBeNull();
  });
});

// ── switchRepository ────────────────────────────────────────────────────────

describe('switchRepository', () => {
  it('renvoie null sans identifiants mémorisés', async () => {
    await expect(switchRepository('autre')).resolves.toBeNull();
  });

  it('récupère un token pour le nouveau dépôt', async () => {
    await saveSession('tok', 3600, 'jean', 'secret', 'depot1', true);
    mockFetchOnce(true, { access_token: 'tok2', expires_in: 3600 });
    await expect(switchRepository('depot2')).resolves.toBe('tok2');
    expect(store.get('agridrone_repository')).toBe('depot2');
  });
});

// ── fetchRepositories / fetchToken ──────────────────────────────────────────

describe('fetchRepositories', () => {
  it('renvoie la liste des dépôts en cas de succès', async () => {
    mockFetchOnce(true, { repositories: [{ cle: 'd1', label: 'Dépôt 1' }] });
    await expect(fetchRepositories('jean', 'secret')).resolves.toEqual([
      { cle: 'd1', label: 'Dépôt 1' },
    ]);
  });

  it('renvoie un tableau vide si repositories est absent', async () => {
    mockFetchOnce(true, {});
    await expect(fetchRepositories('jean', 'secret')).resolves.toEqual([]);
  });

  it('lève une erreur avec le détail du backend', async () => {
    mockFetchOnce(false, { detail: 'Identifiants invalides' }, 401);
    await expect(fetchRepositories('jean', 'faux')).rejects.toThrow('Identifiants invalides');
  });
});

describe('fetchToken', () => {
  it('renvoie la réponse token en cas de succès', async () => {
    mockFetchOnce(true, { access_token: 'abc', expires_in: 3600 });
    await expect(fetchToken('jean', 'secret', 'd1')).resolves.toMatchObject({ access_token: 'abc' });
  });

  it('lève une erreur avec le statut par défaut si pas de détail', async () => {
    mockFetchOnce(false, {}, 500);
    await expect(fetchToken('jean', 'secret', 'd1')).rejects.toThrow('Erreur 500');
  });
});
