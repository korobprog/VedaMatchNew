// Клиентская часть Astro API: запросы из браузера идут с NEXT_PUBLIC_API_URL и
// cookie, а не через серверные хелперы lib/astro-api.ts.
import type {
  AstroCompatibilityPurpose,
  AstroSubjectDto,
  AstroSubjectPairDto,
  AstroSubjectsDto,
  SaveAstroSubjectRequest,
  AstroCompatibilityReadingDto,
  AstroCompatibilityRequestDto,
  AstroSection,
  AstroSectionState,
  AstroTransitPreferenceDto,
  UpdateAstroTransitPreferenceRequest,
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

/** Цель выбирает отправитель: от неё зависит, какие куты идут в расчёт. */
export const createAstroCompatibilityRequest = (
  targetUserId: string,
  purpose: AstroCompatibilityPurpose,
) =>
  requestJson<AstroCompatibilityRequestDto>("/astro/compatibility/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId, purpose }),
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

/**
 * Записи астролога. Владелец нигде не передаётся — сервер берёт его из
 * токена, и подставить чужой отсюда невозможно.
 */
export const listAstroSubjects = () =>
  requestJson<AstroSubjectsDto>("/astro/subjects", { method: "GET" });

export const createAstroSubject = (body: SaveAstroSubjectRequest) =>
  requestJson<AstroSubjectDto>("/astro/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateAstroSubject = (id: string, body: SaveAstroSubjectRequest) =>
  requestJson<AstroSubjectDto>(`/astro/subjects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteAstroSubject = (id: string) =>
  requestJson<{ ok: true }>(`/astro/subjects/${id}`, { method: "DELETE" });

/**
 * Сверка двух записей. Согласия не спрашивают: обе принадлежат тому, кто
 * сверяет, — обмен между участниками портала идёт своим путём.
 */
export const compareAstroSubjects = (
  id: string,
  otherId: string,
  purpose: AstroCompatibilityPurpose,
) =>
  requestJson<AstroSubjectPairDto>(
    `/astro/subjects/${id}/compare/${otherId}?purpose=${purpose}`,
    { method: "GET" },
  );

/** Во сколько присылать персональный день. */
export async function saveAstroTransitPreferences(
  body: UpdateAstroTransitPreferenceRequest,
): Promise<AstroTransitPreferenceDto> {
  const res = await apiFetch(`${API_URL}/astro/today/preferences`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as AstroTransitPreferenceDto;
}
