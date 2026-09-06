"use client";

import type {
  AssistantComposeRequest,
  AssistantComposeResponse,
  AssistantThreadDetail,
  AssistantThreadDto,
  ConfirmAssistantActionRequest,
  ConfirmAssistantActionResponse,
  SendAssistantMessageResponse,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент ассистента. Поверх apiFetch: беседу держат открытой
 * долго, и протухший access-токен чинится прозрачно.
 */
async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      const message = Array.isArray(parsed.message)
        ? parsed.message[0]
        : parsed.message;
      throw new Error(message ?? "Не получилось");
    } catch (error) {
      if (error instanceof Error && error.message !== "Не получилось")
        throw error;
      throw new Error(text || "Не получилось");
    }
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function askAssistant(
  threadId: string | null,
  text: string,
): Promise<SendAssistantMessageResponse> {
  const path = threadId
    ? `/assistant/threads/${encodeURIComponent(threadId)}/messages`
    : "/assistant/messages";
  return send(path, { method: "POST", body: JSON.stringify({ text }) });
}

export function loadAssistantThread(id: string): Promise<AssistantThreadDetail> {
  return send(`/assistant/threads/${encodeURIComponent(id)}`);
}

export function createAssistantThread(): Promise<AssistantThreadDto> {
  return send("/assistant/threads", { method: "POST" });
}

export function deleteAssistantThread(id: string): Promise<void> {
  return send(`/assistant/threads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function decideAssistantAction(
  threadId: string,
  input: ConfirmAssistantActionRequest,
): Promise<ConfirmAssistantActionResponse> {
  return send(`/assistant/threads/${encodeURIComponent(threadId)}/actions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function composeWithAssistant(
  input: AssistantComposeRequest,
): Promise<AssistantComposeResponse> {
  return send("/assistant/compose", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
