"use client";

import type {
  ChatConferenceDto,
  ChatConferenceInviteDto,
  CreateChatConferenceRequest,
} from "@vedamatch/shared";
import { API_URL, ApiError, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент быстрой конференции — маршруты `chat/conference/*`.
 * Знание эндпоинтов и ничего больше: авторизация той же cookie, что у
 * остальных сервисов.
 */

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    // Причина отказа приходит готовым русским текстом: «срок истёк»,
    // «вход закрыли», «мест нет». Она точнее кода статуса, и показывать
    // человеку надо именно её.
    let message = `Ошибка ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data.message)
        message = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
    } catch {
      // Тело не JSON — оставляем код.
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

/** Карточка приглашения: работает и без входа. */
export function getChatConferenceInvite(
  token: string,
): Promise<ChatConferenceInviteDto> {
  return send<ChatConferenceInviteDto>(`/chat/conference/links/${token}`);
}

export function joinChatConference(token: string): Promise<ChatConferenceDto> {
  return send<ChatConferenceDto>(`/chat/conference/links/${token}/join`, {
    method: "POST",
  });
}

export function createChatConference(
  body: CreateChatConferenceRequest = {},
): Promise<ChatConferenceDto> {
  return send<ChatConferenceDto>("/chat/conference", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getChatConference(
  conversationId: string,
): Promise<ChatConferenceDto> {
  return send<ChatConferenceDto>(`/chat/conference/${conversationId}`);
}

export function revokeChatConference(
  conversationId: string,
): Promise<ChatConferenceDto> {
  return send<ChatConferenceDto>(`/chat/conference/${conversationId}/revoke`, {
    method: "POST",
  });
}

export function rotateChatConferenceLink(
  conversationId: string,
): Promise<ChatConferenceDto> {
  return send<ChatConferenceDto>(`/chat/conference/${conversationId}/link`, {
    method: "POST",
  });
}
