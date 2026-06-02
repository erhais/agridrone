import * as SecureStore from 'expo-secure-store';
import { config } from '../config/env';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthRepository {
  cle: string;
  label: string;
  path?: string;
}

interface LoginResponse {
  repositories: AuthRepository[];
}

interface TokenResponse {
  access_token: string;
  expires_in: number;   // secondes (ex: 86400)
  token_type?: string;
}

// ── Clés SecureStore ──────────────────────────────────────────────────────────

const KEY_TOKEN        = 'agridrone_access_token';
const KEY_EXPIRY       = 'agridrone_token_expiry';    // timestamp Unix (ms) — JWT
const KEY_LOGIN        = 'agridrone_login';
const KEY_PASSWORD     = 'agridrone_password';        // chiffré par SecureStore
const KEY_REPOSITORY   = 'agridrone_repository';
const KEY_CREDS_EXPIRY = 'agridrone_creds_expiry';   // timestamp 30 jours
const REMEMBER_MS      = 30 * 24 * 60 * 60 * 1000;  // 30 jours

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchRepositories(
  login: string,
  password: string,
): Promise<AuthRepository[]> {
  console.log('[auth] login →', `${config.baseURL}/api/v1/auth/login`, { login });
  const res = await fetch(`${config.baseURL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  console.log('[auth] login status:', res.status);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    console.warn('[auth] login error body:', body);
    throw new Error((body.detail as string) ?? `Erreur ${res.status}`);
  }
  const data = await res.json() as LoginResponse;
  console.log('[auth] repositories:', data.repositories);
  return data.repositories ?? [];
}

export async function fetchToken(
  login: string,
  password: string,
  repository: string,
): Promise<TokenResponse> {
  const res = await fetch(`${config.baseURL}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password, repository }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.detail as string) ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<TokenResponse>;
}

// ── Stockage session ──────────────────────────────────────────────────────────

export async function saveSession(
  token: string,
  expiresIn: number,
  login: string,
  password: string,
  repository: string,
  rememberMe = false,
): Promise<void> {
  const tokenExpiryMs = Date.now() + expiresIn * 1000;
  const ops: Promise<void>[] = [
    SecureStore.setItemAsync(KEY_TOKEN,  token),
    SecureStore.setItemAsync(KEY_EXPIRY, String(tokenExpiryMs)),
  ];
  if (rememberMe) {
    const credsExpiryMs = Date.now() + REMEMBER_MS;
    ops.push(
      SecureStore.setItemAsync(KEY_LOGIN,        login),
      SecureStore.setItemAsync(KEY_PASSWORD,     password),
      SecureStore.setItemAsync(KEY_REPOSITORY,   repository),
      SecureStore.setItemAsync(KEY_CREDS_EXPIRY, String(credsExpiryMs)),
    );
  } else {
    // Pas de mémorisation : effacer les credentials existants
    ops.push(
      SecureStore.deleteItemAsync(KEY_LOGIN),
      SecureStore.deleteItemAsync(KEY_PASSWORD),
      SecureStore.deleteItemAsync(KEY_REPOSITORY),
      SecureStore.deleteItemAsync(KEY_CREDS_EXPIRY),
    );
  }
  await Promise.all(ops);
}

export async function loadToken(): Promise<string | null> {
  const [token, expiry] = await Promise.all([
    SecureStore.getItemAsync(KEY_TOKEN),
    SecureStore.getItemAsync(KEY_EXPIRY),
  ]);
  if (!token || !expiry) return null;
  if (Date.now() >= Number(expiry)) return null; // expiré
  return token;
}

export async function refreshToken(): Promise<string | null> {
  const [login, password, repository, credsExpiry] = await Promise.all([
    SecureStore.getItemAsync(KEY_LOGIN),
    SecureStore.getItemAsync(KEY_PASSWORD),
    SecureStore.getItemAsync(KEY_REPOSITORY),
    SecureStore.getItemAsync(KEY_CREDS_EXPIRY),
  ]);
  if (!login || !password || !repository) return null;
  // Vérifier que la mémorisation 30 jours n'a pas expiré
  if (credsExpiry && Date.now() >= Number(credsExpiry)) {
    await clearSession();
    return null;
  }
  try {
    const data = await fetchToken(login, password, repository);
    // Conserver rememberMe=true puisque les credentials existent
    await saveSession(data.access_token, data.expires_in, login, password, repository, true);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_TOKEN),
    SecureStore.deleteItemAsync(KEY_EXPIRY),
    SecureStore.deleteItemAsync(KEY_LOGIN),
    SecureStore.deleteItemAsync(KEY_PASSWORD),
    SecureStore.deleteItemAsync(KEY_REPOSITORY),
    SecureStore.deleteItemAsync(KEY_CREDS_EXPIRY),
  ]);
}

export async function getStoredCredentials(): Promise<{
  login: string;
  repository: string;
} | null> {
  const [login, repository] = await Promise.all([
    SecureStore.getItemAsync(KEY_LOGIN),
    SecureStore.getItemAsync(KEY_REPOSITORY),
  ]);
  if (!login || !repository) return null;
  return { login, repository };
}

// Récupère les dépôts disponibles pour l'utilisateur mémorisé
export async function fetchRepositoriesStored(): Promise<AuthRepository[] | null> {
  const [login, password] = await Promise.all([
    SecureStore.getItemAsync(KEY_LOGIN),
    SecureStore.getItemAsync(KEY_PASSWORD),
  ]);
  if (!login || !password) return null;
  try {
    return await fetchRepositories(login, password);
  } catch {
    return null;
  }
}

// Change de projet sans re-saisir les identifiants
export async function switchRepository(repoCle: string): Promise<string | null> {
  const [login, password] = await Promise.all([
    SecureStore.getItemAsync(KEY_LOGIN),
    SecureStore.getItemAsync(KEY_PASSWORD),
  ]);
  if (!login || !password) return null;
  try {
    const data = await fetchToken(login, password, repoCle);
    await saveSession(data.access_token, data.expires_in, login, password, repoCle, true);
    return data.access_token;
  } catch {
    return null;
  }
}
