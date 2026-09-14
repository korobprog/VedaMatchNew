/**
 * HTTP-клиент приложения поверх API портала.
 *
 * В отличие от веба, cookie здесь нет: access-токен уходит в `Authorization:
 * Bearer`, его `AuthGuard` принимает наравне с cookie. Обновление токена
 * делается одним запросом на все одновременные 401 — иначе пять экранов,
 * открытых после сна телефона, сожгут refresh-токен пятью ротациями, и
 * детект повторного использования на сервере разлогинит человека.
 */

export interface SessionPort {
  getAccessToken(): Promise<string | null>;
  /** Новый access-токен или `null`, если сессия закончилась. */
  refresh(): Promise<string | null>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  session: SessionPort;
  fetchImpl?: typeof fetch;
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** NestJS отдаёт `message` строкой или массивом строк от валидации. */
function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length) return message.join('; ');
  }
  return `Запрос завершился с кодом ${status}`;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  let refreshing: Promise<string | null> | null = null;

  function refreshOnce(): Promise<string | null> {
    refreshing ??= options.session.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function send(path: string, init: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return fetchImpl(url, { method: init.method ?? 'GET', headers, body, signal: init.signal });
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const token = await options.session.getAccessToken();
    let response = await send(path, init, token);

    if (response.status === 401 && token) {
      const fresh = await refreshOnce();
      if (fresh) {
        response = await send(path, init, fresh);
      }
      if (!fresh || response.status === 401) {
        options.onSessionExpired?.();
      }
    }

    const body = await readBody(response);
    if (!response.ok) {
      throw new ApiError(response.status, errorMessage(response.status, body), body);
    }
    return body as T;
  }

  return { request };
}
