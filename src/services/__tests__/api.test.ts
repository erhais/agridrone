import { clearSession, loadToken, refreshToken } from '../authService';
import {
  ApiError,
  apiService,
  registerSessionExpiredHandler,
  unregisterSessionExpiredHandler,
} from '../api';

jest.mock('../authService');

const mockLoadToken = loadToken as jest.MockedFunction<typeof loadToken>;
const mockRefresh = refreshToken as jest.MockedFunction<typeof refreshToken>;
const mockClear = clearSession as jest.MockedFunction<typeof clearSession>;

const BASE = 'https://api.agridrone.fr';

/** Construit un objet Response minimal pour le mock fetch. */
function resp(init: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (async () => ({})),
    text: init.text ?? (async () => ''),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadToken.mockResolvedValue(null);
  mockRefresh.mockResolvedValue(null);
  mockClear.mockResolvedValue(undefined);
  unregisterSessionExpiredHandler();
});

afterEach(() => {
  // @ts-expect-error nettoyage du mock fetch global
  global.fetch = undefined;
});

describe('construction de la requête', () => {
  it('préfixe le baseURL et renvoie le JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue(resp({ ok: true, status: 200, json: async () => ({ msg: 'ok' }) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiService.get<{ msg: string }>('/api/v1/hello')).resolves.toEqual({ msg: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/v1/hello`, expect.objectContaining({ method: 'GET' }));
  });

  it('ajoute l’en-tête Authorization quand un token existe', async () => {
    mockLoadToken.mockResolvedValue('tok123');
    const fetchMock = jest.fn().mockResolvedValue(resp({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiService.get('/x');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok123');
  });

  it('n’ajoute pas d’Authorization sans token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(resp({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiService.get('/x');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sérialise le corps en JSON pour un POST', async () => {
    const fetchMock = jest.fn().mockResolvedValue(resp({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiService.post('/x', { a: 1 });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ a: 1 }));
  });
});

describe('flux 401 / refresh', () => {
  it('rafraîchit le token puis rejoue la requête avec succès', async () => {
    mockRefresh.mockResolvedValue('nouveau');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(resp({ ok: false, status: 401 }))
      .mockResolvedValueOnce(resp({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiService.get('/protege')).resolves.toEqual({ ok: true });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('efface la session et notifie le handler si le refresh échoue', async () => {
    mockRefresh.mockResolvedValue(null);
    const onExpired = jest.fn();
    registerSessionExpiredHandler(onExpired);
    const fetchMock = jest.fn().mockResolvedValue(resp({ ok: false, status: 401, json: async () => ({ detail: 'expiré' }) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiService.get('/protege')).rejects.toBeInstanceOf(ApiError);
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('n’appelle plus le handler après désenregistrement', async () => {
    mockRefresh.mockResolvedValue(null);
    const onExpired = jest.fn();
    registerSessionExpiredHandler(onExpired);
    unregisterSessionExpiredHandler();
    global.fetch = jest.fn().mockResolvedValue(resp({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(apiService.get('/protege')).rejects.toBeInstanceOf(ApiError);
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('parsing du détail d’erreur', () => {
  it('expose le statut dans ApiError', async () => {
    global.fetch = jest.fn().mockResolvedValue(resp({ ok: false, status: 404, json: async () => ({ detail: 'introuvable' }) })) as unknown as typeof fetch;
    await expect(apiService.get('/x')).rejects.toMatchObject({ status: 404 });
  });

  it('utilise un détail chaîne', async () => {
    global.fetch = jest.fn().mockResolvedValue(resp({ ok: false, status: 400, json: async () => ({ detail: 'Champ requis' }) })) as unknown as typeof fetch;
    await expect(apiService.get('/x')).rejects.toThrow('400 — Champ requis');
  });

  it('sérialise un détail tableau (erreurs de validation)', async () => {
    const detail = [{ loc: ['body', 'nom'], msg: 'requis' }];
    global.fetch = jest.fn().mockResolvedValue(resp({ ok: false, status: 422, json: async () => ({ detail }) })) as unknown as typeof fetch;
    await expect(apiService.get('/x')).rejects.toThrow(JSON.stringify(detail));
  });

  it('bascule sur le texte brut quand le corps n’est pas du JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(resp({
      ok: false,
      status: 500,
      json: async () => { throw new Error('pas du JSON'); },
      text: async () => 'Internal Server Error',
    })) as unknown as typeof fetch;
    await expect(apiService.get('/x')).rejects.toThrow('500 — Internal Server Error');
  });
});

describe('getArrayBuffer', () => {
  it('renvoie l’ArrayBuffer en cas de succès', async () => {
    const buf = new ArrayBuffer(8);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => buf,
    }) as unknown as typeof fetch;
    await expect(apiService.getArrayBuffer('/pdf')).resolves.toBe(buf);
  });

  it('lève une ApiError si la réponse n’est pas ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as typeof fetch;
    await expect(apiService.getArrayBuffer('/pdf')).rejects.toBeInstanceOf(ApiError);
  });
});
