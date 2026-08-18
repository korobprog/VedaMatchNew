// Единый браузерный клиент к API портала.
//
// Access-cookie живёт 15 минут, refresh — дольше и только на /auth/*.
// До появления этого файла каждый компонент звал fetch напрямую и на 401
// просто показывал ошибку: человек, просидевший в чате или на доске больше
// четверти часа, «терял» сессию до перезагрузки страницы. Здесь 401 один раз
// прозрачно чинится через POST /auth/refresh (параллельные запросы делят
// один refresh), после чего исходный запрос повторяется. Если refresh не
// помог — сессии действительно нет: сообщаем странице событием
// `vedamatch:session-expired`, а дальше решает <SessionGuard/>.
//
// Использование — как fetch: `apiFetch(\`${API_URL}/notices\`, init)`.
// Серверные хелперы (lib/api.ts и *-server-api.ts) сюда не ходят: у них
// cookie из next/headers, а не браузера.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const SESSION_EXPIRED_EVENT = "vedamatch:session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Один refresh на все одновременные 401: десять запросов страницы после
 * простоя не должны устраивать десять ротаций refresh-токена (каждая
 * отзывает предыдущий — часть из них гарантированно проиграет гонку).
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function isAuthEndpoint(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return url.startsWith(`${API_URL}/auth/`);
}

function notifySessionExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

/**
 * Drop-in замена fetch для запросов к API: всегда `credentials: "include"`,
 * на 401 — refresh и один повтор. Тело запроса из строки/FormData можно
 * отправлять повторно; для одноразовых стримов повтор не делаем.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const withCreds: RequestInit = { credentials: "include", ...init };
  const res = await fetch(input, withCreds);
  if (res.status !== 401 || isAuthEndpoint(input)) return res;

  const bodyIsReplayable =
    init.body === undefined ||
    typeof init.body === "string" ||
    init.body instanceof FormData ||
    init.body instanceof URLSearchParams ||
    init.body instanceof Blob;
  if (!bodyIsReplayable) return res;

  const refreshed = await refreshSession();
  if (!refreshed) {
    notifySessionExpired();
    return res;
  }
  const retry = await fetch(input, withCreds);
  if (retry.status === 401) notifySessionExpired();
  return retry;
}

/** Текст ошибки из тела ответа Nest (`message` строкой или массивом). */
export async function readErrorMessage(
  res: Response,
  fallback = `Запрос не выполнен (${res.status})`,
): Promise<string> {
  try {
    const body = (await res.clone().json()) as {
      message?: string | string[];
    };
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // тело не JSON — оставляем запасной текст
  }
  return fallback;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Типизированный запрос: JSON туда и обратно, ошибка — ApiError с текстом
 * бэкенда. 204 → undefined.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await apiFetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? JSON_HEADERS : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw new ApiError(await readErrorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
