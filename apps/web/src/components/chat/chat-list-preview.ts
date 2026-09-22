import type { ChatConversationSummary } from "@vedamatch/shared";

/**
 * Вторая строка беседы в списке.
 *
 * Отдельным чистым модулем, а не функцией внутри `chat-list-view.tsx`: здесь
 * решается приоритет, а не рисуется разметка. Идущий групповой звонок важнее
 * последнего сообщения — сообщение подождёт, разговор идёт сейчас, — и это
 * ровно то правило, которое надо проверять таблицей случаев, а не глазами
 * на снимке.
 *
 * Флаг `live`, а не готовый класс: цвет и начертание выбирает тот, кто
 * показывает, как и все прочие решения оформления в портале.
 */
export interface ChatListPreview {
  text: string;
  /** В беседе прямо сейчас разговаривают. */
  live: boolean;
}

export function chatListPreview(
  conversation: ChatConversationSummary,
): ChatListPreview {
  // Звонок идёт — это и есть новость беседы. `activeGroupCallId` считается
  // по живым участникам (`liveCallByConversation` на сервере), так что
  // замолчавшая комната сюда не попадает.
  if (conversation.activeGroupCallId)
    return { text: "Идёт групповой звонок", live: true };

  const message = conversation.lastMessage;
  if (!message) return { text: "Пока ни одного сообщения", live: false };
  if (message.deletedAt) return { text: "Сообщение удалено", live: false };

  const prefix =
    conversation.kind === "direct" ? "" : `${message.author.name}: `;
  if (message.body) return { text: `${prefix}${message.body}`, live: false };

  return { text: `${prefix}${attachmentLabel(message.attachments[0]?.kind)}`, live: false };
}

/** У вложения показываем его вид, а не пустоту. */
function attachmentLabel(kind: string | undefined): string {
  switch (kind) {
    case "voice":
      return "Голосовое сообщение";
    case "image":
      return "Фотография";
    case "file":
      return "Файл";
    case "story":
      return "Сторис";
    default:
      return "Вложение";
  }
}
