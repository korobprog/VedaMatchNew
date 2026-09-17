/**
 * HTTP-клиент приложения поверх API портала.
 *
 * В отличие от веба, cookie здесь нет: access-токен уходит в `Authorization:
 * Bearer`, его `AuthGuard` принимает наравне с cookie. Обновление токена
 * делается одним запросом на все одновременные 401 — иначе пять экранов,
 * открытых после сна телефона, сожгут refresh-токен пятью ротациями, и
 * детект повторного использования на сервере разлогинит человека.
 */

/**
 * Три различимых исхода `refresh()`, а не голая строка/`null`
 * (`gan-harness/feedback/feedback-003.md`, блокирующий п.1): раньше и
 * «получили новый токен», и «сервер сейчас недоступен, вот вам старый
 * просроченный обратно» выглядели для `request()` одинаково (непустая
 * строка) — второй случай заставлял слепо повторить запрос ТЕМ ЖЕ уже
 * отвергнутым токеном, получить второй 401 и ошибочно закончить сессию
 * (`clearTokens()`) из-за временной недоступности `/auth/app/refresh`, а не
 * из-за реального конца сессии — подозреваемая причина VED-234.
 */
export type SessionRefreshResult =
  /** Сервер выдал рабочий access-токен — можно повторить запрос им. */
  | { kind: 'refreshed'; accessToken: string }
  /** Сервер явно ОТВЕРГ refresh-токен (401/403) — сессия действительно
   *  закончилась, токены уже стёрты источником (`tokenAuthority`). */
  | { kind: 'rejected' }
  /** Сеть недоступна, сервер лёг на 5xx, таймаут — сессия НЕ закончилась,
   *  просто сейчас не вышло обновиться; токены не тронуты. */
  | { kind: 'unavailable' };

export interface SessionPort {
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<SessionRefreshResult>;
}

export type RefreshDecision =
  | { action: 'retry'; accessToken: string }
  | { action: 'session-expired' }
  | { action: 'network-unavailable' };

/** Что делать после `session.refresh()` на 401 — чистая часть решения,
 *  вынесена из `request()` ради отдельного теста в изоляции от `fetch`. */
export function decideAfterRefresh(result: SessionRefreshResult): RefreshDecision {
  if (result.kind === 'refreshed') return { action: 'retry', accessToken: result.accessToken };
  if (result.kind === 'rejected') return { action: 'session-expired' };
  return { action: 'network-unavailable' };
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
  let refreshing: Promise<SessionRefreshResult> | null = null;

  function refreshOnce(): Promise<SessionRefreshResult> {
    refreshing ??= options.session.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function send(path: string, init: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (init.body instanceof FormData) {
      // Вложение чата: `FormData` не сериализуется и не получает свой
      // `Content-Type` — RN сам подставит `multipart/form-data; boundary=…`
      // по объекту `FormData`, ручной заголовок его ломает.
      body = init.body;
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return fetchImpl(url, { method: init.method ?? 'GET', headers, body, signal: init.signal });
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const token = await options.session.getAccessToken();
    let response = await send(path, init, token);

    if (response.status === 401) {
      if (!token) {
        // Запрос ушёл вовсе без токена (сессия уже мертва по мнению
        // клиента) и сервер это подтвердил — сообщить об этом надо всё
        // равно: молчание здесь раньше означало «запрос просто падает
        // ApiError», а UI остаётся в состоянии «вошёл», хотя выйти не
        // может ничем, кроме перезапуска приложения
        // (`gan-harness/feedback/feedback-002.md`, блокирующий п.1).
        options.onSessionExpired?.();
      } else {
        const decision = decideAfterRefresh(await refreshOnce());
        if (decision.action === 'retry') {
          response = await send(path, init, decision.accessToken);
          // Сервер отверг и СВЕЖИЙ токен — это уже настоящий конец сессии,
          // а не временная нехватка обновления.
          if (response.status === 401) options.onSessionExpired?.();
        } else if (decision.action === 'session-expired') {
          options.onSessionExpired?.();
        } else {
          // 'network-unavailable': сеть/сервер сейчас недоступны — не
          // выходим и не повторяем запрос тем же уже отвергнутым токеном;
          // вызывающий код должен увидеть сетевую ошибку и предложить
          // «повторить», а не показать экран входа
          // (`gan-harness/feedback/feedback-003.md`, блокирующий п.1).
          throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и повторите.', null);
        }
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
