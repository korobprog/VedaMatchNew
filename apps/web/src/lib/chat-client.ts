"use client";

import type {
  ChatConversationDetail,
  ChatMessageDto as ChatMessage,
  ChatConversationSummary,
  ChatMessageDto,
  ChatReactionSummary,
  ChatSearchState,
  ChatThreadState,
  ChatUploadResult,
  CreateChatConversationRequest,
  SendChatMessageRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Браузерный клиент чата. Поверх apiFetch: он один раз прозрачно чинит
 * протухший access-токен, а в переписке это случается чаще, чем где-либо
 * ещё — вкладку с чатом держат открытой часами.
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
    // Текст ошибки от Nest приходит JSON-ом; человеку нужно поле message.
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

export function sendChatMessage(
  conversationId: string,
  body: SendChatMessageRequest,
): Promise<ChatMessageDto> {
  return send<ChatMessageDto>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function editChatMessage(
  messageId: string,
  body: string,
): Promise<ChatMessageDto> {
  return send<ChatMessageDto>(`/chat/messages/${messageId}/edit`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteChatMessage(messageId: string): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(`/chat/messages/${messageId}`, {
    method: "DELETE",
  });
}

export function setChatReaction(
  messageId: string,
  emoji: string,
): Promise<{ reactions: ChatReactionSummary[] }> {
  return send<{ reactions: ChatReactionSummary[] }>(
    `/chat/messages/${messageId}/reaction`,
    { method: "POST", body: JSON.stringify({ emoji }) },
  );
}

export function markChatRead(
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  return send<{ lastReadAt: string }>(
    `/chat/conversations/${conversationId}/read`,
    { method: "POST" },
  );
}

/**
 * Сигнал «печатает…». Ошибки глотаем: это украшение, и падать из-за него
 * посреди набора текста нельзя.
 */
export function pingChatTyping(conversationId: string): void {
  void apiFetch(`${API_URL}/chat/conversations/${conversationId}/typing`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

export function acceptChatRequest(
  conversationId: string,
): Promise<ChatConversationSummary> {
  return send<ChatConversationSummary>(
    `/chat/conversations/${conversationId}/accept`,
    { method: "POST" },
  );
}

export function declineChatRequest(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(
    `/chat/conversations/${conversationId}/decline`,
    { method: "POST" },
  );
}

export function createChatConversation(
  body: CreateChatConversationRequest,
): Promise<ChatConversationSummary> {
  return send<ChatConversationSummary>("/chat/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setChatMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ muted: boolean }> {
  return send<{ muted: boolean }>(`/chat/conversations/${conversationId}/mute`, {
    method: "POST",
    body: JSON.stringify({ muted }),
  });
}

export function setChatPinned(
  conversationId: string,
  pinned: boolean,
): Promise<{ pinned: boolean }> {
  return send<{ pinned: boolean }>(`/chat/conversations/${conversationId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned }),
  });
}

export function pinChatMessage(
  conversationId: string,
  messageId: string | null,
): Promise<{ pinnedMessage: ChatMessage | null }> {
  return send<{ pinnedMessage: ChatMessage | null }>(
    `/chat/conversations/${conversationId}/pinned-message`,
    { method: "POST", body: JSON.stringify({ messageId }) },
  );
}

export function removeChatMember(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(
    `/chat/conversations/${conversationId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function setChatMemberRole(
  conversationId: string,
  userId: string,
  role: "admin" | "member",
): Promise<{ role: string }> {
  return send<{ role: string }>(
    `/chat/conversations/${conversationId}/members/${userId}/role`,
    { method: "POST", body: JSON.stringify({ role }) },
  );
}

export function addChatMembers(
  conversationId: string,
  userIds: string[],
): Promise<{ added: number }> {
  return send<{ added: number }>(
    `/chat/conversations/${conversationId}/members`,
    { method: "POST", body: JSON.stringify({ userIds }) },
  );
}

export function forwardChatMessage(
  messageId: string,
  conversationId: string,
): Promise<ChatMessage> {
  return send<ChatMessage>(`/chat/messages/${messageId}/forward`, {
    method: "POST",
    body: JSON.stringify({ conversationId }),
  });
}

export function updateChatConversation(
  conversationId: string,
  patch: {
    title?: string;
    description?: string;
    avatarUrl?: string;
    avatarKey?: string;
    visibility?: "public" | "private";
  },
): Promise<ChatConversationSummary> {
  return send<ChatConversationSummary>(`/chat/conversations/${conversationId}`, {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export function leaveChatConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(
    `/chat/conversations/${conversationId}/members/me`,
    { method: "DELETE" },
  );
}

/** Удалить группу или канал целиком. Доступно только владельцу. */
export function deleteChatConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(`/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function subscribeToChannel(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(
    `/chat/conversations/${conversationId}/subscribe`,
    { method: "POST" },
  );
}

export function loadChatThread(messageId: string): Promise<ChatThreadState> {
  return send<ChatThreadState>(`/chat/messages/${messageId}/thread`);
}

/** Отметка просмотров: ошибки глотаем, это счётчик, а не действие. */
export function markChatViewed(messageIds: string[]): void {
  if (messageIds.length === 0) return;
  void apiFetch(`${API_URL}/chat/views`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageIds }),
  }).catch(() => undefined);
}

export function searchChat(query: string): Promise<ChatSearchState> {
  return send<ChatSearchState>(
    `/chat/search?q=${encodeURIComponent(query)}`,
  );
}

export function loadOlderChatMessages(
  conversationId: string,
  before: string,
): Promise<ChatConversationDetail> {
  return send<ChatConversationDetail>(
    `/chat/conversations/${conversationId}?before=${encodeURIComponent(before)}`,
  );
}

export function uploadChatFile(
  conversationId: string,
  file: File,
): Promise<ChatUploadResult> {
  const form = new FormData();
  form.append("file", file);
  return send<ChatUploadResult>(
    `/chat/conversations/${conversationId}/uploads`,
    { method: "POST", body: form },
  );
}

export function reportChat(body: {
  reason: string;
  comment?: string;
  messageId?: string;
  conversationId?: string;
}): Promise<{ id: string }> {
  return send<{ id: string }>("/chat/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
