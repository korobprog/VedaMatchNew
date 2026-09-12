// API-клиент сервиса «Вакансии». См. docs/service-module-contract.md.
// Запросы идут из браузера: авторизация — той же cookie, что и у остальных
// сервисов, поэтому здесь только знание эндпоинтов, без работы с токенами.
import type {
  AdminVacancyOfferActionRequest,
  AdminVacancyOfferDto,
  AdminVacancyOffersFilters,
  AdminVacancyOffersResponse,
  AdminVacancyReportDecisionRequest,
  AdminVacancyStatsDto,
  AdminVacancyReportsResponse,
  CreateVacancyOfferRequest,
  CreateVacancyReportRequest,
  CreateVacancyResponseRequest,
  MyVacancyResponsesResponse,
  UpdateVacancyOfferRequest,
  UpdateVacancyResponseStatusRequest,
  UpdateVacancyStatusRequest,
  VacancyFeedFilters,
  VacancyFeedResponse,
  VacancyOfferDto,
  VacancyResponseDto,
  VacancyResponsesResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export class VacanciesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
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
    throw new VacanciesApiError(
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

export function buildVacanciesQuery(filters: VacancyFeedFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.remote) params.set("remote", "true");
  if (filters.communityOnly) params.set("communityOnly", "true");
  if (filters.communityId) params.set("communityId", filters.communityId);
  if (filters.mine) params.set("mine", "true");
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const getVacanciesFeed = (
  filters: VacancyFeedFilters,
  signal?: AbortSignal,
) =>
  request<VacancyFeedResponse>(`/vacancies${buildVacanciesQuery(filters)}`, {
    method: "GET",
    signal,
  });

export const getVacancy = (id: string, signal?: AbortSignal) =>
  request<VacancyOfferDto>(`/vacancies/${id}`, { method: "GET", signal });

export const createVacancy = (body: CreateVacancyOfferRequest) =>
  request<VacancyOfferDto>("/vacancies", { method: "POST", ...json(body) });

export const updateVacancy = (id: string, body: UpdateVacancyOfferRequest) =>
  request<VacancyOfferDto>(`/vacancies/${id}`, {
    method: "PATCH",
    ...json(body),
  });

export const setVacancyStatus = (
  id: string,
  body: UpdateVacancyStatusRequest,
) =>
  request<VacancyOfferDto>(`/vacancies/${id}/status`, {
    method: "POST",
    ...json(body),
  });

export const renewVacancy = (id: string) =>
  request<VacancyOfferDto>(`/vacancies/${id}/renew`, { method: "POST" });

export const deleteVacancy = (id: string) =>
  request<void>(`/vacancies/${id}`, { method: "DELETE" });

// ===== Отклики =====

export const respondToVacancy = (
  id: string,
  body: CreateVacancyResponseRequest,
) =>
  request<VacancyResponseDto>(`/vacancies/${id}/responses`, {
    method: "POST",
    ...json(body),
  });

export const getVacancyResponses = (id: string, signal?: AbortSignal) =>
  request<VacancyResponsesResponse>(`/vacancies/${id}/responses`, {
    method: "GET",
    signal,
  });

export const getMyVacancyResponses = (signal?: AbortSignal) =>
  request<MyVacancyResponsesResponse>("/vacancies/responses/mine", {
    method: "GET",
    signal,
  });

export const setVacancyResponseStatus = (
  responseId: string,
  body: UpdateVacancyResponseStatusRequest,
) =>
  request<VacancyResponseDto>(`/vacancies/responses/${responseId}/status`, {
    method: "POST",
    ...json(body),
  });

export const withdrawVacancyResponse = (responseId: string) =>
  request<void>(`/vacancies/responses/${responseId}`, { method: "DELETE" });

// ===== Жалобы =====

export const reportVacancy = (id: string, body: CreateVacancyReportRequest) =>
  request<{ ok: true }>(`/vacancies/${id}/report`, {
    method: "POST",
    ...json(body),
  });

export const getAdminVacancyReports = (status?: string) =>
  request<AdminVacancyReportsResponse>(
    `/admin/vacancies/reports${status ? `?status=${status}` : ""}`,
    { method: "GET" },
  );

export const decideAdminVacancyReport = (
  id: string,
  body: AdminVacancyReportDecisionRequest,
) =>
  request<{ ok: true }>(`/admin/vacancies/reports/${id}/decide`, {
    method: "POST",
    ...json(body),
  });

export const getAdminVacancyOffers = (filters: AdminVacancyOffersFilters) => {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const qs = params.toString();
  return request<AdminVacancyOffersResponse>(
    `/admin/vacancies${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
};

export const getAdminVacancyStats = () =>
  request<AdminVacancyStatsDto>("/admin/vacancies/stats", { method: "GET" });

export const actOnAdminVacancyOffer = (
  id: string,
  body: AdminVacancyOfferActionRequest,
) =>
  request<AdminVacancyOfferDto>(`/admin/vacancies/${id}/action`, {
    method: "POST",
    ...json(body),
  });
