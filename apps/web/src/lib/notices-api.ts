// API-клиент сервиса «Объявления». См. docs/service-module-contract.md.
// Запросы идут из браузера: авторизация — той же cookie, что и у остальных
// сервисов, поэтому здесь только знание эндпоинтов, без работы с токенами.
import type {
  AdminNoticeReportDecisionRequest,
  AdminNoticeReportsResponse,
  CreateNoticeReportRequest,
  CreateNoticeRequest,
  CreateNoticeResponseRequest,
  CreateNoticeSubscriptionRequest,
  CreateNoticeThanksRequest,
  NoticeSubscriptionDto,
  NoticeSubscriptionsResponse,
  MyNoticeResponsesResponse,
  NoticeKarmaDto,
  NoticeResponseDto,
  NoticeResponsesResponse,
  NoticeCalendarResponse,
  NoticeDto,
  NoticeFeedFilters,
  NoticeFeedResponse,
  NoticeKind,
  NoticeMapResponse,
  NoticeImageUploadResponse,
  NoticeRubricsResponse,
  ReorderNoticeImagesRequest,
  UpdateNoticeRequest,
  UpdateNoticeStatusRequest,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class NoticesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    // Бэкенд присылает готовый русский текст ошибки — он точнее кода статуса.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new NoticesApiError(
      message ?? `Запрос не выполнен (${res.status})`,
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function buildNoticesQuery(filters: NoticeFeedFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.rubric) params.set("rubric", filters.rubric);
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.country?.trim()) params.set("country", filters.country.trim());
  if (filters.communityId) params.set("communityId", filters.communityId);
  // Радиус и точка уходят только парой: по отдельности сервер их отвергнет.
  if (filters.radiusKm && filters.lat !== undefined && filters.lon !== undefined) {
    params.set("radiusKm", String(filters.radiusKm));
    params.set("lat", String(filters.lat));
    params.set("lon", String(filters.lon));
  }
  if (filters.mine) params.set("mine", "true");
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const getNoticeRubrics = (signal?: AbortSignal) =>
  request<NoticeRubricsResponse>("/notices/rubrics", {
    method: "GET",
    signal,
  });

export const getNoticesFeed = (
  filters: NoticeFeedFilters,
  signal?: AbortSignal,
) =>
  request<NoticeFeedResponse>(`/notices${buildNoticesQuery(filters)}`, {
    method: "GET",
    signal,
  });

export const getNoticesMap = (
  area: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
    kind?: NoticeKind;
  },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    minLat: String(area.minLat),
    maxLat: String(area.maxLat),
    minLon: String(area.minLon),
    maxLon: String(area.maxLon),
    zoom: String(area.zoom),
  });
  if (area.kind) params.set("kind", area.kind);
  return request<NoticeMapResponse>(`/notices/map?${params}`, {
    method: "GET",
    signal,
  });
};

export const getNoticeCalendar = (
  range: { from: string; to: string; rubric?: string },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (range.rubric) params.set("rubric", range.rubric);
  return request<NoticeCalendarResponse>(`/notices/events?${params}`, {
    method: "GET",
    signal,
  });
};

/** Ссылка на `.ics`. Скачивание идёт обычным переходом — файл отдаёт API. */
export const noticeIcsUrl = (id: string) => `${API_URL}/notices/${id}/ics`;

export const getNotice = (id: string, signal?: AbortSignal) =>
  request<NoticeDto>(`/notices/${id}`, { method: "GET", signal });

export const createNotice = (body: CreateNoticeRequest) =>
  request<NoticeDto>("/notices", { method: "POST", ...json(body) });

export const updateNotice = (id: string, body: UpdateNoticeRequest) =>
  request<NoticeDto>(`/notices/${id}`, { method: "PATCH", ...json(body) });

export const setNoticeStatus = (id: string, body: UpdateNoticeStatusRequest) =>
  request<NoticeDto>(`/notices/${id}/status`, { method: "POST", ...json(body) });

export const renewNotice = (id: string) =>
  request<NoticeDto>(`/notices/${id}/renew`, { method: "POST" });

export const deleteNotice = (id: string) =>
  request<void>(`/notices/${id}`, { method: "DELETE" });

export const uploadNoticeImages = (id: string, files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  // Content-Type не задаём: браузер сам поставит boundary для multipart.
  return request<NoticeImageUploadResponse>(`/notices/${id}/images`, {
    method: "POST",
    body: form,
  });
};

export const deleteNoticeImage = (id: string, imageId: string) =>
  request<void>(`/notices/${id}/images/${imageId}`, { method: "DELETE" });

export const reorderNoticeImages = (
  id: string,
  body: ReorderNoticeImagesRequest,
) =>
  request<void>(`/notices/${id}/images/order`, { method: "PUT", ...json(body) });

// ===== Отклики, благодарности, жалобы =====

export const createNoticeResponse = (
  id: string,
  body: CreateNoticeResponseRequest,
) =>
  request<NoticeResponseDto>(`/notices/${id}/responses`, {
    method: "POST",
    ...json(body),
  });

export const getNoticeResponses = (id: string, signal?: AbortSignal) =>
  request<NoticeResponsesResponse>(`/notices/${id}/responses`, {
    method: "GET",
    signal,
  });

export const getMyNoticeResponses = (signal?: AbortSignal) =>
  request<MyNoticeResponsesResponse>("/notices/responses/mine", {
    method: "GET",
    signal,
  });

export const respondToNoticeResponse = (responseId: string, accept: boolean) =>
  request<NoticeResponseDto>(`/notices/responses/${responseId}/respond`, {
    method: "POST",
    ...json({ accept }),
  });

export const withdrawNoticeResponse = (responseId: string) =>
  request<void>(`/notices/responses/${responseId}`, { method: "DELETE" });

export const thankForNotice = (id: string, body: CreateNoticeThanksRequest) =>
  request<NoticeKarmaDto>(`/notices/${id}/thanks`, {
    method: "POST",
    ...json(body),
  });

export const getNoticeKarma = (userId: string, signal?: AbortSignal) =>
  request<NoticeKarmaDto>(`/notices/karma/${userId}`, {
    method: "GET",
    signal,
  });

export const reportNotice = (id: string, body: CreateNoticeReportRequest) =>
  request<{ ok: true }>(`/notices/${id}/report`, {
    method: "POST",
    ...json(body),
  });

export const getNoticeSubscriptions = (signal?: AbortSignal) =>
  request<NoticeSubscriptionsResponse>("/notices/subscriptions", {
    method: "GET",
    signal,
  });

export const subscribeToNotices = (body: CreateNoticeSubscriptionRequest) =>
  request<NoticeSubscriptionDto>("/notices/subscriptions", {
    method: "POST",
    ...json(body),
  });

export const unsubscribeFromNotices = (id: string) =>
  request<void>(`/notices/subscriptions/${id}`, { method: "DELETE" });

export const getAdminNoticeReports = (status = "open", signal?: AbortSignal) =>
  request<AdminNoticeReportsResponse>(
    `/admin/notices/reports?status=${status}`,
    { method: "GET", signal },
  );

export const decideNoticeReport = (
  reportId: string,
  body: AdminNoticeReportDecisionRequest,
) =>
  request<{ ok: true }>(`/admin/notices/reports/${reportId}/decide`, {
    method: "POST",
    ...json(body),
  });
