import { config } from '../config/env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    // Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
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
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'GET',
      headers: buildHeaders(),
    });
    return handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  }

  async postArrayBuffer(path: string, body: unknown): Promise<ArrayBuffer> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new ApiError(response.status, `Erreur HTTP ${response.status}`);
    }
    return response.arrayBuffer();
  }

  async delete<T>(path: string): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    return handleResponse<T>(response);
  }
}

export const apiService = new ApiService();
