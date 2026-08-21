// Команды рассылок из браузера. Серверное чтение списка живёт в lib/api.ts:
// один модуль не может тянуть next/headers и импортироваться в клиентский
// компонент одновременно.
import type {
  CreateNotificationBroadcastRequest,
  NotificationAudienceFilter,
  NotificationAudiencePreviewResponse,
  NotificationBroadcastDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const BROWSER_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function command<T>(path: string, init: RequestInit): Promise<T> {
  const response = await apiFetch(`${BROWSER_API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const previewAudience = (audience: NotificationAudienceFilter) =>
  command<NotificationAudiencePreviewResponse>(
    "/admin/notifications/broadcasts/preview",
    { method: "POST", body: JSON.stringify({ audience }) },
  );

export const createBroadcast = (body: CreateNotificationBroadcastRequest) =>
  command<NotificationBroadcastDto>("/admin/notifications/broadcasts", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const sendBroadcast = (id: string) =>
  command<NotificationBroadcastDto>(
    `/admin/notifications/broadcasts/${id}/send`,
    { method: "POST" },
  );

export const cancelBroadcast = (id: string) =>
  command<NotificationBroadcastDto>(
    `/admin/notifications/broadcasts/${id}/cancel`,
    { method: "POST" },
  );

export const deleteBroadcast = (id: string) =>
  command<void>(`/admin/notifications/broadcasts/${id}`, { method: "DELETE" });
