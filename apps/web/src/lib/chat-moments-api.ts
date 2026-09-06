"use client";

import type {
  ChatConversationSummary,
  ChatMessageDto,
  ChatMomentDto,
  ChatMomentFeed,
  ChatMomentSettingsState,
  ChatMomentViewersState,
  ChatMomentsState,
  PublishChatMomentRequest,
  SaveChatMomentSettingsRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент моментов. Отдельным файлом от `chat-client.ts` по тому
 * же принципу, что оформление и справочник людей: раздел свой, и подмешивать
 * его вызовы в переписку значит держать один файл на весь сервис.
 */

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { message?: string };
      throw new Error(parsed.message ?? "Не получилось");
    } catch (error) {
      if (error instanceof Error && error.message !== "Не получилось")
        throw error;
      throw new Error(text || "Не получилось");
    }
  }
  return (await res.json()) as T;
}

export function loadChatMoments(): Promise<ChatMomentsState> {
  return send<ChatMomentsState>("/chat/moments");
}

/**
 * Лента автора перезапрашивается при каждом открытии просмотрщика, а не
 * берётся из того, что приехало с загрузкой страницы: ссылки на файлы
 * подписаны на шесть часов, а момент живёт сутки — вкладку, открытую с утра,
 * вечером встретили бы пустые прямоугольники.
 */
export function loadChatMomentsOf(userId: string): Promise<ChatMomentFeed> {
  return send<ChatMomentFeed>(`/chat/moments/user/${userId}`);
}

export function publishChatMoment(
  body: PublishChatMomentRequest,
): Promise<ChatMomentDto> {
  return send<ChatMomentDto>("/chat/moments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function uploadChatMomentImage(
  file: File,
): Promise<{ url: string; width: number | null; height: number | null }> {
  const form = new FormData();
  form.append("file", file);
  return send("/chat/moments/uploads", { method: "POST", body: form });
}

export function markChatMomentViewed(momentId: string): Promise<{ ok: true }> {
  return send<{ ok: true }>(`/chat/moments/${momentId}/view`, {
    method: "POST",
  });
}

export function replyToChatMoment(
  momentId: string,
  body: string,
): Promise<ChatMessageDto> {
  return send<ChatMessageDto>(`/chat/moments/${momentId}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function loadChatMomentViewers(
  momentId: string,
): Promise<ChatMomentViewersState> {
  return send<ChatMomentViewersState>(`/chat/moments/${momentId}/viewers`);
}

export function deleteChatMoment(momentId: string): Promise<{ ok: true }> {
  return send<{ ok: true }>(`/chat/moments/${momentId}`, { method: "DELETE" });
}

export function loadChatMomentSettings(): Promise<ChatMomentSettingsState> {
  return send<ChatMomentSettingsState>("/chat/moments/settings");
}

export function saveChatMomentSettings(
  body: SaveChatMomentSettingsRequest,
): Promise<ChatMomentSettingsState> {
  return send<ChatMomentSettingsState>("/chat/moments/settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** «Избранное»: беседа заводится при первом обращении. */
export function openSavedConversation(): Promise<ChatConversationSummary> {
  return send<ChatConversationSummary>("/chat/saved", { method: "POST" });
}
