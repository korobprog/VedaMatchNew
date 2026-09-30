// API-клиент подсервиса «Карта» («Путешествия»). См. docs/service-module-contract.md.
import type {
  AdminTravelMapPlacesQuery,
  AdminTravelMapReportsQuery,
  CreateTravelMapPlaceRequest,
  CreateTravelMapRouteRequest,
  TravelMapCheckVerdict,
  TravelMapFreshnessDto,
  TravelMapGroupResponse,
  TravelMapNoteDto,
  GeoSearchResult,
  TravelMapPlaceDto,
  TravelMapPlacesQuery,
  TravelMapPlacesResponse,
  TravelMapReportDto,
  UpdateTravelMapPlaceRequest,
  UpdateTravelMapRouteRequest,
  TravelMapRouteDto,
  TravelMapRouteSummaryDto,
  TravelMapRoutesQuery,
  TravelMapRoutesResponse,
  TravelMapPlaceStatus,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export class TravelMapApiError extends Error {
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
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new TravelMapApiError(
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

function toQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  return query.size ? `?${query}` : "";
}

const placePath = (id: string, suffix = "") =>
  `/travel/map/places/${encodeURIComponent(id)}${suffix}`;

export const getTravelMapPlaces = (
  query: TravelMapPlacesQuery,
  signal?: AbortSignal,
) =>
  request<TravelMapPlacesResponse>(
    `/travel/map/places${toQuery({ ...query })}`,
    { method: "GET", signal },
  );

/** Группа места в «Общении»: создаёт беседу или возвращает уже существующую. */
export const openTravelMapPlaceGroup = (id: string) =>
  request<TravelMapGroupResponse>(placePath(id, "/group"), { method: "POST" });

export const getTravelMapPlace = (id: string, signal?: AbortSignal) =>
  request<TravelMapPlaceDto>(placePath(id), { method: "GET", signal });

export const createTravelMapPlace = (body: CreateTravelMapPlaceRequest) =>
  request<TravelMapPlaceDto>("/travel/map/places", {
    method: "POST",
    ...json(body),
  });

export const updateTravelMapPlace = (
  id: string,
  body: UpdateTravelMapPlaceRequest,
) =>
  request<TravelMapPlaceDto>(placePath(id), { method: "PATCH", ...json(body) });

export const deleteTravelMapPlace = (id: string) =>
  request<void>(placePath(id), { method: "DELETE" });

export const uploadTravelMapPhoto = (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<TravelMapPlaceDto>(placePath(id, "/photos"), {
    method: "POST",
    body: form,
  });
};

export const deleteTravelMapPhoto = (id: string, index: number) =>
  request<TravelMapPlaceDto>(placePath(id, `/photos/${index}`), {
    method: "DELETE",
  });

export const reportTravelMapPlace = (id: string, reason: string) =>
  request<{ ok: true }>(placePath(id, "/report"), {
    method: "POST",
    ...json({ reason }),
  });

export const checkTravelMapPlace = (id: string, verdict: TravelMapCheckVerdict) =>
  request<TravelMapFreshnessDto>(placePath(id, "/check"), {
    method: "POST",
    ...json({ verdict }),
  });

export const getTravelMapNotes = (id: string, signal?: AbortSignal) =>
  request<TravelMapNoteDto[]>(placePath(id, "/notes"), { method: "GET", signal });

export const addTravelMapNote = (id: string, text: string) =>
  request<TravelMapNoteDto>(placePath(id, "/notes"), {
    method: "POST",
    ...json({ text }),
  });

export const deleteTravelMapNote = (id: string, noteId: string) =>
  request<void>(placePath(id, `/notes/${encodeURIComponent(noteId)}`), {
    method: "DELETE",
  });

/** Поиск адреса через общий геокодер портала. */
export const searchGeo = (query: string, signal?: AbortSignal) =>
  request<GeoSearchResult[]>(`/geo/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    signal,
  });

export const getAdminTravelMapPlaces = (
  query: AdminTravelMapPlacesQuery,
  signal?: AbortSignal,
) =>
  request<TravelMapPlaceDto[]>(
    `/travel/map/admin/places${toQuery({ ...query })}`,
    { method: "GET", signal },
  );

const adminAction = (id: string, action: string, body?: unknown) =>
  request<TravelMapPlaceDto>(`/travel/map/admin/places/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    ...(body === undefined ? {} : json(body)),
  });

export const verifyTravelMapPlace = (id: string) => adminAction(id, "verify");
export const unverifyTravelMapPlace = (id: string) =>
  adminAction(id, "unverify");
export const unhideTravelMapPlace = (id: string) => adminAction(id, "unhide");
export const hideTravelMapPlace = (id: string, reason?: string) =>
  adminAction(id, "hide", { reason });

export const getAdminTravelMapReports = (
  query: AdminTravelMapReportsQuery,
  signal?: AbortSignal,
) =>
  request<TravelMapReportDto[]>(
    `/travel/map/admin/reports${toQuery({ ...query })}`,
    { method: "GET", signal },
  );

export const resolveTravelMapReport = (id: string) =>
  request<unknown>(`/travel/map/admin/reports/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
  });

// ----- Маршруты -----

const routePath = (id: string, suffix = "") =>
  `/travel/map/routes/${encodeURIComponent(id)}${suffix}`;

export const getTravelMapRoutes = (
  query: TravelMapRoutesQuery,
  signal?: AbortSignal,
) =>
  request<TravelMapRoutesResponse>(
    `/travel/map/routes${toQuery({ ...query })}`,
    { method: "GET", signal },
  );

export const getTravelMapRoute = (id: string, signal?: AbortSignal) =>
  request<TravelMapRouteDto>(routePath(id), { method: "GET", signal });

export const createTravelMapRoute = (body: CreateTravelMapRouteRequest) =>
  request<TravelMapRouteDto>("/travel/map/routes", {
    method: "POST",
    ...json(body),
  });

export const updateTravelMapRoute = (
  id: string,
  body: UpdateTravelMapRouteRequest,
) =>
  request<TravelMapRouteDto>(routePath(id), { method: "PATCH", ...json(body) });

export const deleteTravelMapRoute = (id: string) =>
  request<void>(routePath(id), { method: "DELETE" });

export const getAdminTravelMapRoutes = (
  query: { status?: TravelMapPlaceStatus; q?: string },
  signal?: AbortSignal,
) =>
  request<TravelMapRouteSummaryDto[]>(
    `/travel/map/admin/routes${toQuery({ ...query })}`,
    { method: "GET", signal },
  );

export const hideTravelMapRoute = (id: string, reason?: string) =>
  request<unknown>(`/travel/map/admin/routes/${encodeURIComponent(id)}/hide`, {
    method: "POST",
    ...json({ reason }),
  });

export const unhideTravelMapRoute = (id: string) =>
  request<unknown>(`/travel/map/admin/routes/${encodeURIComponent(id)}/unhide`, {
    method: "POST",
  });

// ----- Прогулка: рассказ, фото и видео остановок -----

const stopPath = (routeId: string, stopId: string, suffix: string) =>
  routePath(routeId, `/stops/${encodeURIComponent(stopId)}${suffix}`);

const fileForm = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

export const uploadTravelMapStopPhoto = (
  routeId: string,
  stopId: string,
  file: File,
) =>
  request<TravelMapRouteDto>(stopPath(routeId, stopId, "/photos"), {
    method: "POST",
    body: fileForm(file),
  });

export const deleteTravelMapStopPhoto = (
  routeId: string,
  stopId: string,
  index: number,
) =>
  request<TravelMapRouteDto>(stopPath(routeId, stopId, `/photos/${index}`), {
    method: "DELETE",
  });

export const uploadTravelMapStopVideo = (
  routeId: string,
  stopId: string,
  file: File,
) =>
  request<TravelMapRouteDto>(stopPath(routeId, stopId, "/video"), {
    method: "POST",
    body: fileForm(file),
  });

export const deleteTravelMapStopVideo = (routeId: string, stopId: string) =>
  request<TravelMapRouteDto>(stopPath(routeId, stopId, "/video"), {
    method: "DELETE",
  });

export const updateTravelMapStopStory = (
  routeId: string,
  stopId: string,
  story: string,
) =>
  request<TravelMapRouteDto>(stopPath(routeId, stopId, "/story"), {
    method: "PATCH",
    ...json({ story }),
  });
