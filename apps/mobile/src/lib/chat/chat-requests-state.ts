import type { ChatRequestSummary } from '@vedamatch/shared';

/**
 * Список запросов на переписку. Правила перенесены с сайта
 * (`apps/web/src/components/chat/chat-requests-view.tsx`).
 */

/** Карточка уходит из списка: запрос разобран здесь или уже в другом месте. */
export function withoutRequest(requests: ChatRequestSummary[], conversationId: string): ChatRequestSummary[] {
  return requests.filter((request) => request.conversation.id !== conversationId);
}

/** Текст первого сообщения; вложение без подписи — «Вложение», пустой запрос — ничего. */
export function requestPreview(request: Pick<ChatRequestSummary, 'message'>): string | null {
  const message = request.message;
  if (!message) return null;
  return message.body.trim() || 'Вложение';
}

/**
 * Профиль без фото и без общин сначала показывается свёрнутым: столько же
 * усилий на создание, сколько у спамера. Раскрытие — только локальное.
 */
export function startsHidden(request: Pick<ChatRequestSummary, 'lowTrust'>): boolean {
  return request.lowTrust;
}
