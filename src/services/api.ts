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
    switch (response.status) {
      case 401:
        throw new ApiError(401, 'Non authentifié');
      case 403:
        throw new ApiError(403, 'Accès refusé');
      case 404:
        throw new ApiError(404, 'Ressource introuvable');
      case 500:
        throw new ApiError(500, 'Erreur serveur');
      default:
        throw new ApiError(response.status, `Erreur HTTP ${response.status}`);
    }
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

  async delete<T>(path: string): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.baseURL}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    return handleResponse<T>(response);
  }
}

export const apiService = new ApiService();
