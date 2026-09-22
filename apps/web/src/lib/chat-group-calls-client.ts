"use client";

import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatGroupCallSignalsResponse,
  ChatGroupCallState,
} from "@vedamatch/shared";
import { API_URL, ApiError, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент групповых звонков — маршруты `chat/group-calls/*`
 * (`apps/api/src/modules/chat/calls/group/chat-group-calls.controller.ts`).
 *
 * Состав комнаты и сигналы второй стороны приходят не отсюда, а через
 * общий поток `subscribeToChat` — ровно как у звонка один на один.
 * ICE-серверов здесь нет намеренно: TURN общий, учётки берутся тем же
 * `getChatIceServers()` из `chat-calls-client.ts`.
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

/** Идёт ли звонок в беседе; без `conversationId` — где мы сами сейчас. */
export function getActiveGroupCall(
  conversationId?: string,
): Promise<ChatGroupCallState> {
  return send<ChatGroupCallState>(
    conversationId
      ? `/chat/group-calls/active?conversationId=${encodeURIComponent(conversationId)}`
      : "/chat/group-calls/active",
  );
}

/** Начать или войти в идущий — на сервере это одна операция. */
export function startGroupCall(
  conversationId: string,
): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>("/chat/group-calls", {
    method: "POST",
    body: JSON.stringify({ conversationId, kind: "audio" }),
  });
}

export function joinGroupCall(callId: string): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>(`/chat/group-calls/${callId}/join`, {
    method: "POST",
  });
}

export function leaveGroupCall(callId: string): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>(`/chat/group-calls/${callId}/leave`, {
    method: "POST",
  });
}

export function setGroupCallMuted(
  callId: string,
  muted: boolean,
): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>(`/chat/group-calls/${callId}/state`, {
    method: "POST",
    body: JSON.stringify({ muted }),
  });
}

/**
 * Попросить место под камеру. Именно попросить: мест в комнате три, а
 * участников четыре, и включение может вернуть 409 с текстом отказа —
 * решает сервер (`group-call-video.ts`). В теле только `video`: запрос
 * меняет то, что в нём пришло, и микрофон трогать не должен.
 */
export function setGroupCallVideo(
  callId: string,
  video: boolean,
): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>(`/chat/group-calls/${callId}/state`, {
    method: "POST",
    body: JSON.stringify({ video }),
  });
}

/** «Я ещё здесь» — и заодно свежий состав комнаты. */
export function heartbeatGroupCall(
  callId: string,
): Promise<ChatGroupCallDto> {
  return send<ChatGroupCallDto>(`/chat/group-calls/${callId}/heartbeat`, {
    method: "POST",
  });
}

export function sendGroupCallSignal(
  callId: string,
  toUserId: string,
  signal: ChatCallSignal,
  clientSignalId?: string,
): Promise<void> {
  return send<void>(`/chat/group-calls/${callId}/signal`, {
    method: "POST",
    body: JSON.stringify({ toUserId, signal, clientSignalId }),
  });
}

/**
 * Дочитать сигналы, пропущенные, пока `/chat/stream` не был подключён, —
 * та же беда и то же лечение, что в VED-261 у звонка один на один, только
 * сигналов больше: в mesh'е их по одной очереди на каждую пару.
 */
export function getGroupCallSignals(
  callId: string,
  after: number,
): Promise<ChatGroupCallSignalsResponse> {
  return send<ChatGroupCallSignalsResponse>(
    `/chat/group-calls/${callId}/signals?after=${after}`,
  );
}
