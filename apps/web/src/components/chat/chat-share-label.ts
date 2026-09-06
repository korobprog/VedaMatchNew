import type { ChatAttachmentKind } from "@vedamatch/shared";

/**
 * Подпись источника карточки — та же, что потом стоит на вложении.
 *
 * Отдельный модуль без «use client»: подпись нужна и серверной странице
 * отправки, и клиентскому списку бесед, а функцию из клиентского модуля
 * сервер вызвать не может.
 */
export function shareSourceLabel(kind: ChatAttachmentKind): string {
  if (kind === "story") return "Сторис · Вдохновение";
  if (kind === "notice") return "Объявление";
  if (kind === "listing") return "Товар · Рынок";
  if (kind === "assistant") return "Ответ ассистента";
  return "Карточка";
}
