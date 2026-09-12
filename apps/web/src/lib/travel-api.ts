// API-клиент сервиса «Путешествия». См. docs/service-module-contract.md.
import type {
  CreateTravelBookingRequest,
  CreateTravelStayRequest,
  TravelBookingDto,
  TravelBookingsResponse,
  TravelPlacesResponse,
  TravelStayCardDto,
  TravelStayDto,
  TravelStayKind,
  TravelStayPayment,
  TravelStaysResponse,
  UpdateTravelStayRequest,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export class TravelApiError extends Error {
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
    throw new TravelApiError(
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

export const getTravelPlaces = (signal?: AbortSignal) =>
  request<TravelPlacesResponse>("/travel/places", { method: "GET", signal });

export const getTravelStays = (
  filters: {
    placeId?: string;
    kind?: TravelStayKind;
    payment?: TravelStayPayment;
  } = {},
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams();
  if (filters.placeId) query.set("placeId", filters.placeId);
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.payment) query.set("payment", filters.payment);
  const suffix = query.size ? `?${query}` : "";
  return request<TravelStaysResponse>(`/travel/stays${suffix}`, {
    method: "GET",
    signal,
  });
};

export const getTravelStay = (id: string, signal?: AbortSignal) =>
  request<TravelStayDto>(`/travel/stays/${encodeURIComponent(id)}`, {
    method: "GET",
    signal,
  });

export const getMyTravelBookings = (signal?: AbortSignal) =>
  request<TravelBookingsResponse>("/travel/bookings", { method: "GET", signal });

export const createTravelBooking = (body: CreateTravelBookingRequest) =>
  request<TravelBookingDto>("/travel/bookings", { method: "POST", ...json(body) });

export const cancelTravelBooking = (id: string) =>
  request<TravelBookingDto>(
    `/travel/bookings/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );

// ===== Управление своим объектом =====

export const getManagedStays = (signal?: AbortSignal) =>
  request<TravelStaysResponse>("/travel/manage/stays", {
    method: "GET",
    signal,
  });

export const createManagedStay = (body: CreateTravelStayRequest) =>
  request<TravelStayCardDto>("/travel/manage/stays", {
    method: "POST",
    ...json(body),
  });

export const updateManagedStay = (id: string, body: UpdateTravelStayRequest) =>
  request<TravelStayCardDto>(`/travel/manage/stays/${encodeURIComponent(id)}`, {
    method: "PATCH",
    ...json(body),
  });

export const setManagedStayStatus = (
  id: string,
  status: "draft" | "published" | "hidden_by_author",
) =>
  request<TravelStayCardDto>(
    `/travel/manage/stays/${encodeURIComponent(id)}/status`,
    { method: "PATCH", ...json({ status }) },
  );

export const addManagedRoom = (
  stayId: string,
  body: {
    building?: string;
    number: string;
    capacity?: number;
    priceMinor?: number | null;
  },
) =>
  request<{ id: string }>(
    `/travel/manage/stays/${encodeURIComponent(stayId)}/rooms`,
    { method: "POST", ...json(body) },
  );

export const removeManagedRoom = (stayId: string, roomId: string) =>
  request<void>(
    `/travel/manage/stays/${encodeURIComponent(stayId)}/rooms/${encodeURIComponent(roomId)}`,
    { method: "DELETE" },
  );

export const getStayBookings = (stayId: string, signal?: AbortSignal) =>
  request<TravelBookingsResponse>(
    `/travel/manage/stays/${encodeURIComponent(stayId)}/bookings`,
    { method: "GET", signal },
  );

export const decideTravelBooking = (
  bookingId: string,
  status: "accepted" | "declined" | "checked_in" | "completed",
  declineReason?: string,
) =>
  request<TravelBookingDto>(
    `/travel/manage/bookings/${encodeURIComponent(bookingId)}`,
    { method: "PATCH", ...json({ status, declineReason }) },
  );
