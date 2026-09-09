"use client";

import type {
  ChatActiveCallState,
  ChatCallDto,
  ChatCallKind,
  ChatCallSignal,
  ChatIceServersState,
  EndChatCallRequest,
} from "@vedamatch/shared";
import { API_URL, ApiError, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент звонков — маршруты `chat/calls/*`. Ответы второй
 * стороны (принял, положил трубку, SDP и ICE) приходят не отсюда, а через
 * общий поток `subscribeToChat`.
 */

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getChatIceServers(): Promise<ChatIceServersState> {
  return send<ChatIceServersState>("/chat/calls/ice-servers");
}

export function getActiveChatCall(): Promise<ChatActiveCallState> {
  return send<ChatActiveCallState>("/chat/calls/active");
}

export function startChatCall(
  conversationId: string,
  kind: ChatCallKind,
): Promise<ChatCallDto> {
  return send<ChatCallDto>("/chat/calls", {
    method: "POST",
    body: JSON.stringify({ conversationId, kind }),
  });
}

export function acceptChatCall(callId: string): Promise<ChatCallDto> {
  return send<ChatCallDto>(`/chat/calls/${callId}/accept`, { method: "POST" });
}

export function declineChatCall(callId: string): Promise<ChatCallDto> {
  return send<ChatCallDto>(`/chat/calls/${callId}/decline`, {
    method: "POST",
  });
}

export function endChatCall(
  callId: string,
  body: EndChatCallRequest = {},
): Promise<ChatCallDto> {
  return send<ChatCallDto>(`/chat/calls/${callId}/end`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function sendChatCallSignal(
  callId: string,
  signal: ChatCallSignal,
): Promise<void> {
  return send<void>(`/chat/calls/${callId}/signal`, {
    method: "POST",
    body: JSON.stringify({ signal }),
  });
}
