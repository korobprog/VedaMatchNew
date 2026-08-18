// Клиентский API уведомлений: подписка создаётся в браузере, поэтому запросы
// идут с NEXT_PUBLIC_API_URL и cookie, а не через серверные хелперы lib/api.ts.
import type {
  NotificationInboxResponse,
  NotificationPreferencesDto,
  NotificationUnreadCountResponse,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
  VapidKeyResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

export function fetchInbox(): Promise<NotificationInboxResponse> {
  return request("/notifications/inbox");
}

/** Без `ids` помечает прочитанным всё непрочитанное. */
export function markInboxRead(ids?: string[]): Promise<{ ok: true }> {
  return request("/notifications/inbox/read", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : {}),
  });
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
