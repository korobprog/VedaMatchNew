"use client";

import type {
  ChatColorTemplateDto,
  ChatColorTemplatesState,
  ChatConversationThemeState,
  SaveChatColorTemplateRequest,
} from "@vedamatch/shared";
import { apiRequest } from "@/lib/http-client";

/** Браузерный клиент конструктора цвета чата. См. lib/chat-appearance-api. */

export function listColorTemplates(): Promise<ChatColorTemplatesState> {
  return apiRequest<ChatColorTemplatesState>("/chat/color-templates");
}

export function createColorTemplate(
  body: SaveChatColorTemplateRequest,
): Promise<ChatColorTemplateDto> {
  return apiRequest<ChatColorTemplateDto>("/chat/color-templates", {
    method: "POST",
    json: body,
  });
}

export function updateColorTemplate(
  id: string,
  body: SaveChatColorTemplateRequest,
): Promise<ChatColorTemplateDto> {
  return apiRequest<ChatColorTemplateDto>(
    `/chat/color-templates/${encodeURIComponent(id)}`,
    { method: "POST", json: body },
  );
}

export function deleteColorTemplate(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/chat/color-templates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function getConversationTheme(
  conversationId: string,
): Promise<ChatConversationThemeState> {
  return apiRequest<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
  );
}

export function setConversationTheme(
  conversationId: string,
  templateId: string | null,
): Promise<ChatConversationThemeState> {
  return apiRequest<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
    { method: "POST", json: { templateId } },
  );
}
