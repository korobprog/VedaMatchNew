// Админский клиент сервиса «Путешествия». Отдельный файл от пользовательского:
// у него другие маршруты и другие права, и мешать их в одном месте значит
// однажды дёрнуть админский эндпоинт из пользовательского экрана.
import type {
  AdminTravelStayDto,
  AdminTravelStaysResponse,
  TravelPlacesResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    throw new Error(message ?? `Запрос не выполнен (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getAdminTravelPlaces = (signal?: AbortSignal) =>
  request<TravelPlacesResponse>("/travel/admin/places", {
    method: "GET",
    signal,
  });

export const createAdminTravelPlace = (body: {
  name: string;
  country: string;
  region?: string;
  lat: number;
  lng: number;
  summary?: string;
}) =>
  request<{ id: string }>("/travel/admin/places", {
    method: "POST",
    ...json(body),
  });

export const removeAdminTravelPlace = (id: string) =>
  request<void>(`/travel/admin/places/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const getAdminTravelStays = (signal?: AbortSignal) =>
  request<AdminTravelStaysResponse>("/travel/admin/stays", {
    method: "GET",
    signal,
  });

export const setAdminTravelStayStatus = (
  id: string,
  status: "removed_by_admin" | "published" | "draft",
) =>
  request<AdminTravelStayDto>(
    `/travel/admin/stays/${encodeURIComponent(id)}/status`,
    { method: "PATCH", ...json({ status }) },
  );
