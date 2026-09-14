// API-клиент сервиса «Путешествия». См. docs/service-module-contract.md.
import type {
  CreateTravelBookingRequest,
  ContactTravelStayRequest,
  ContactTravelStayResponse,
  CreateTravelStayRequest,
  SaveTravelCashCategoryRequest,
  SaveTravelCashEntryRequest,
  SaveTravelGuestRequest,
  SaveTravelCashTemplateRequest,
  TravelCashTemplateDto,
  TravelCashTemplatesResponse,
  TravelGuestDto,
  TravelGuestsResponse,
  TravelCashCategoriesResponse,
  TravelCashCategoryDto,
  TravelCashEntriesResponse,
  TravelCashEntryDto,
  TravelGuestBookingResponse,
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

/** Заявка со страницы по QR: гостю без аккаунта вернётся токен привязки. */
export const createPublicTravelBooking = (body: CreateTravelBookingRequest) =>
  request<TravelGuestBookingResponse>("/travel/public/bookings", {
    method: "POST",
    ...json(body),
  });

export const claimTravelBooking = (token: string) =>
  request<TravelBookingDto>("/travel/bookings/claim", {
    method: "POST",
    ...json({ token }),
  });

/** «Написать хозяину»: id беседы в «Общении». */
export const contactTravelStay = (
  stayId: string,
  body: ContactTravelStayRequest = {},
) =>
  request<ContactTravelStayResponse>(
    `/travel/stays/${encodeURIComponent(stayId)}/contact`,
    { method: "POST", ...json(body) },
  );

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

// ===== Касса объекта =====

const cashPath = (stayId: string, rest: string) =>
  `/travel/manage/stays/${encodeURIComponent(stayId)}/cash/${rest}`;

export const getCashCategories = (stayId: string, signal?: AbortSignal) =>
  request<TravelCashCategoriesResponse>(cashPath(stayId, "categories"), {
    method: "GET",
    signal,
  });

export const createCashCategory = (
  stayId: string,
  body: SaveTravelCashCategoryRequest,
) =>
  request<TravelCashCategoryDto>(cashPath(stayId, "categories"), {
    method: "POST",
    ...json(body),
  });

export const updateCashCategory = (
  stayId: string,
  categoryId: string,
  body: Pick<SaveTravelCashCategoryRequest, "name" | "icon">,
) =>
  request<TravelCashCategoryDto>(
    cashPath(stayId, `categories/${encodeURIComponent(categoryId)}`),
    { method: "PATCH", ...json(body) },
  );

export const removeCashCategory = (stayId: string, categoryId: string) =>
  request<void>(
    cashPath(stayId, `categories/${encodeURIComponent(categoryId)}`),
    { method: "DELETE" },
  );

export const getCashEntries = (
  stayId: string,
  query: { from: string; to: string } & Record<string, string>,
  signal?: AbortSignal,
) =>
  request<TravelCashEntriesResponse>(
    cashPath(stayId, `entries?${new URLSearchParams(query)}`),
    { method: "GET", signal },
  );

export const removeCashEntries = (stayId: string, ids: string[]) =>
  request<{ removed: number }>(cashPath(stayId, "entries/remove"), {
    method: "POST",
    ...json({ ids }),
  });

export const getCashTemplates = (stayId: string, signal?: AbortSignal) =>
  request<TravelCashTemplatesResponse>(cashPath(stayId, "templates"), {
    method: "GET",
    signal,
  });

export const createCashTemplate = (
  stayId: string,
  body: SaveTravelCashTemplateRequest,
) =>
  request<TravelCashTemplateDto>(cashPath(stayId, "templates"), {
    method: "POST",
    ...json(body),
  });

export const removeCashTemplate = (stayId: string, templateId: string) =>
  request<void>(
    cashPath(stayId, `templates/${encodeURIComponent(templateId)}`),
    { method: "DELETE" },
  );

export const createCashEntry = (
  stayId: string,
  body: SaveTravelCashEntryRequest,
) =>
  request<TravelCashEntryDto>(cashPath(stayId, "entries"), {
    method: "POST",
    ...json(body),
  });

export const updateCashEntry = (
  stayId: string,
  entryId: string,
  body: SaveTravelCashEntryRequest,
) =>
  request<TravelCashEntryDto>(
    cashPath(stayId, `entries/${encodeURIComponent(entryId)}`),
    { method: "PATCH", ...json(body) },
  );

export const removeCashEntry = (stayId: string, entryId: string) =>
  request<void>(cashPath(stayId, `entries/${encodeURIComponent(entryId)}`), {
    method: "DELETE",
  });

// ===== Клиентская база объекта =====

const guestsPath = (stayId: string, rest = "") =>
  `/travel/manage/stays/${encodeURIComponent(stayId)}/guests${rest}`;

export const getGuests = (stayId: string, signal?: AbortSignal) =>
  request<TravelGuestsResponse>(guestsPath(stayId), { method: "GET", signal });

export const createGuest = (stayId: string, body: SaveTravelGuestRequest) =>
  request<TravelGuestDto>(guestsPath(stayId), { method: "POST", ...json(body) });

export const updateGuest = (
  stayId: string,
  guestId: string,
  body: SaveTravelGuestRequest,
) =>
  request<TravelGuestDto>(guestsPath(stayId, `/${encodeURIComponent(guestId)}`), {
    method: "PATCH",
    ...json(body),
  });

export const removeGuest = (stayId: string, guestId: string) =>
  request<void>(guestsPath(stayId, `/${encodeURIComponent(guestId)}`), {
    method: "DELETE",
  });

export const uploadGuestPhoto = (stayId: string, guestId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request<TravelGuestDto>(
    guestsPath(stayId, `/${encodeURIComponent(guestId)}/photo`),
    { method: "POST", body: form },
  );
};

export const removeGuestPhoto = (stayId: string, guestId: string) =>
  request<TravelGuestDto>(
    guestsPath(stayId, `/${encodeURIComponent(guestId)}/photo`),
    { method: "DELETE" },
  );

export const setCashOpening = (stayId: string, openingMinor: number) =>
  request<{ openingMinor: number }>(cashPath(stayId, "opening"), {
    method: "PATCH",
    ...json({ openingMinor }),
  });

export const decideTravelBooking = (
  bookingId: string,
  status: "accepted" | "declined" | "checked_in" | "completed",
  declineReason?: string,
) =>
  request<TravelBookingDto>(
    `/travel/manage/bookings/${encodeURIComponent(bookingId)}`,
    { method: "PATCH", ...json({ status, declineReason }) },
  );
