// Клиентский API уведомлений: подписка создаётся в браузере, поэтому запросы
// идут в API своего контура (lib/api-base) с cookie, а не через серверные
// хелперы lib/api.ts.
import type {
  NotificationDeliveryStatusDto,
  NotificationHistoryResponse,
  NotificationInboxResponse,
  NotificationPreferencesDto,
  NotificationReadStateRequest,
  NotificationReadStateResponse,
  NotificationUnreadCountResponse,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
  VapidKeyResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchVapidKey(): Promise<string> {
  const { publicKey } = await request<VapidKeyResponse>(
    "/notifications/vapid-key",
  );
  // Пустой ключ отдаёт API без VAPID в окружении. Молча продолжать нельзя:
  // subscribe() с пустым ключом падает невнятной ошибкой браузера.
  if (!publicKey) throw new Error("VAPID public key is not configured");
  return publicKey;
}

export function saveSubscription(body: PushSubscriptionRequest): Promise<void> {
  return request("/notifications/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function removeSubscription(endpoint: string): Promise<void> {
  return request("/notifications/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function fetchUnreadCount(): Promise<NotificationUnreadCountResponse> {
  return request("/notifications/unread-count");
}

/** Что просим у ленты: порцию с такого-то места и, может быть, поиск. */
export interface InboxQuery {
  /** Курсор из прошлого ответа; пусто — первая порция. */
  cursor?: string | null;
  /** Поиск по заголовку и тексту; пусто — обычная лента. */
  query?: string;
  /** Размер порции; пусто — сколько решит сервер. */
  limit?: number;
}

/**
 * Порция ленты (VED-267). Поиск и подгрузка — параметры запроса, а не отбор
 * среди уже загруженного: лента приходит частями, и фильтр на клиенте искал
 * бы только в том, до чего человек долистал.
 */
export function fetchInbox(
  options: InboxQuery = {},
): Promise<NotificationInboxResponse> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.query) params.set("q", options.query);
  if (options.limit) params.set("limit", String(options.limit));
  const search = params.toString();
  return request(`/notifications/inbox${search ? `?${search}` : ""}`);
}

/**
 * Порция истории уведомлений (VED-404): прочитанное в порядке последнего
 * контакта. Курсор — строка из прошлого ответа, внутрь клиент не смотрит.
 */
export function fetchInboxHistory(
  options: { cursor?: string | null; limit?: number } = {},
): Promise<NotificationHistoryResponse> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const search = params.toString();
  return request(`/notifications/history${search ? `?${search}` : ""}`);
}

/**
 * Без `ids` помечает прочитанным всё непрочитанное. С `ids` — ещё и отметка
 * контакта (VED-404): открытое уже прочитанное поднимается в истории.
 */
export function markInboxRead(ids?: string[]): Promise<{ ok: true }> {
  return request("/notifications/inbox/read", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : {}),
  });
}

/**
 * Своя отметка у одного уведомления (VED-143), в обе стороны.
 *
 * Не `markInboxRead([id])`: тот умеет только в одну сторону и ничего не
 * возвращает, а кнопке на карточке нужен и откат, и свежий счётчик для
 * колокольчика в том же ответе.
 */
export function setInboxItemRead(
  id: string,
  read: boolean,
): Promise<NotificationReadStateResponse> {
  const body: NotificationReadStateRequest = { read };
  return request(`/notifications/inbox/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Есть ли куда доставлять уведомления этому человеку (VED-314). Настройки
 * спрашивают об этом сами: разрешение браузера и живая подписка на сервере —
 * разные вещи, и раньше расхождение между ними было видно только в логах.
 */
export function fetchDeliveryStatus(): Promise<NotificationDeliveryStatusDto> {
  return request("/notifications/delivery-status");
}

export function fetchPreferences(): Promise<NotificationPreferencesDto> {
  return request("/notifications/preferences");
}

export function savePreferences(
  patch: UpdateNotificationPreferencesRequest,
): Promise<NotificationPreferencesDto> {
  return request("/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
