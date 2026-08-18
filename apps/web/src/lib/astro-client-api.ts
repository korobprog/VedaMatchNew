// Клиентская часть Astro API: запросы из браузера идут с NEXT_PUBLIC_API_URL и
// cookie, а не через серверные хелперы lib/astro-api.ts.
import type {
  AstroCompatibilityReadingDto,
  AstroCompatibilityRequestDto,
  AstroSection,
  AstroSectionState,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class AstroReadingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Сгенерировать раздел. Готовый вернётся из кэша, квота при этом не тратится —
 * решение принимает сервер, клиенту про это знать не нужно.
 */
export async function generateAstroReading(
  section: AstroSection,
): Promise<AstroSectionState> {
  const res = await apiFetch(`${API_URL}/astro/readings/${section}`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    // Сообщение с сервера объясняет причину точнее, чем код: исчерпанная квота,
    // выключенный ИИ и нехватка данных требуют разных слов пользователю.
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new AstroReadingError(
      message ?? `Не удалось получить разбор (${res.status})`,
      res.status,
    );
  }

  return (await res.json()) as AstroSectionState;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new AstroReadingError(
      message ?? `Запрос не выполнен (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const listAstroCompatibilityRequests = () =>
  requestJson<AstroCompatibilityRequestDto[]>("/astro/compatibility/requests", {
    method: "GET",
  });

export const createAstroCompatibilityRequest = (targetUserId: string) =>
  requestJson<AstroCompatibilityRequestDto>("/astro/compatibility/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId }),
  });

export const respondAstroCompatibilityRequest = (id: string, accept: boolean) =>
  requestJson<AstroCompatibilityRequestDto>(`/astro/compatibility/requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accept }),
  });

export const generateAstroCompatibilityReading = (id: string) =>
  requestJson<AstroCompatibilityReadingDto>(
    `/astro/compatibility/requests/${id}/reading`,
    { method: "POST" },
  );
