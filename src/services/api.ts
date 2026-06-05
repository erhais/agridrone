import { config } from '../config/env';
import { clearSession, loadToken, refreshToken } from './authService';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Callback appelé quand le token est rejeté par le BO et que le refresh échoue.
let _onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(fn: () => void): void {
  _onSessionExpired = fn;
}

export function unregisterSessionExpiredHandler(): void {
  _onSessionExpired = null;
}

async function buildHeaders(): Promise<HeadersInit> {
  const token = await loadToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(
  response: Response,
  retry: () => Promise<Response>,
): Promise<T> {
  if (response.status === 401) {
    // Tenter un refresh silencieux
    const newToken = await refreshToken();
    if (newToken) {
      const retried = await retry();
      if (retried.ok) return retried.json() as Promise<T>;
    }
    // Refresh impossible : session expirée → retour à la connexion
    await clearSession();
    _onSessionExpired?.();
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as Record<string, unknown>;
      detail = (body.detail as string) ?? JSON.stringify(body);
    } catch {
      try { detail = await response.text(); } catch { /* ignore */ }
    }
    const msg = detail ? `${response.status} — ${detail}` : `Erreur HTTP ${response.status}`;
    throw new ApiError(response.status, msg);
  }
  return response.json() as Promise<T>;
}

export class ApiService {
  private readonly baseURL: string = config.baseURL;
  private readonly timeout: number = config.timeout;

  private async fetchWithTimeout(
    input: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const doRequest = async () =>
      this.fetchWithTimeout(url, { method: 'GET', headers: await buildHeaders() });
    const response = await doRequest();
    return handleResponse<T>(response, doRequest);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const doRequest = async () =>
      this.fetchWithTimeout(url, {
        method: 'POST', headers: await buildHeaders(), body: JSON.stringify(body),
      });
    const response = await doRequest();
    return handleResponse<T>(response, doRequest);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const doRequest = async () =>
      this.fetchWithTimeout(url, {
        method: 'PUT', headers: await buildHeaders(), body: JSON.stringify(body),
      });
    const response = await doRequest();
    return handleResponse<T>(response, doRequest);
  }

  async postArrayBuffer(path: string, body: unknown): Promise<ArrayBuffer> {
    const url = `${this.baseURL}${path}`;
    const headers = await buildHeaders();
    const response = await this.fetchWithTimeout(url, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!response.ok) throw new ApiError(response.status, `Erreur HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const doRequest = async () =>
      this.fetchWithTimeout(url, {
        method: 'PATCH', headers: await buildHeaders(), body: JSON.stringify(body),
      });
    const response = await doRequest();
    return handleResponse<T>(response, doRequest);
  }

  async delete<T>(path: string): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const doRequest = async () =>
      this.fetchWithTimeout(url, { method: 'DELETE', headers: await buildHeaders() });
    const response = await doRequest();
    return handleResponse<T>(response, doRequest);
  }
}

export const apiService = new ApiService();
