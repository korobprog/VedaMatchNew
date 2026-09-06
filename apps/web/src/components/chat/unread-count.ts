import type { ChatMessageDto } from "@vedamatch/shared";

/**
 * Счётчик непрочитанных у беседы в списке.
 *
 * Своё сообщение непрочитанным не бывает: его отправили из этой же вкладки
 * или из соседней. Раньше своё отличали по `readByOthers` — мол, у своего
 * это поле заполнено, у чужого нет. Признак оказался неверным: сервер
 * присылает поле всегда, и счётчик не рос ни разу. В списке было тихо, пока
 * человек не перезагружал страницу.
 *
 * Правильный признак один — автор.
 */
export function nextUnreadCount(
  current: number,
  message: ChatMessageDto,
  viewerId: string,
): number {
  return message.author.id === viewerId ? current : current + 1;
}
