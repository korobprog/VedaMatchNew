import type { ChatMessageDto } from "@vedamatch/shared";

/**
 * Где в переписке начинается непрочитанное.
 *
 * Счётчик был только в списке бесед: он говорил «три новых», а открыв
 * переписку, человек оказывался в конце ленты и искал глазами, с какого места
 * читать. Особенно в группе, где за ночь набегает полсотни сообщений.
 *
 * Считается один раз, по состоянию на открытие. Отметка о прочтении ставится
 * тут же при входе, и пересчёт двигал бы черту вниз на глазах — до тех пор,
 * пока она не исчезла бы совсем.
 */
export function firstUnreadIndex(
  messages: readonly ChatMessageDto[],
  viewerId: string,
  lastReadAt: string | null | undefined,
): number | null {
  // Ни разу не открывал: всё непрочитанное, но черта над первым же
  // сообщением ничего не сообщает — она разделяла бы ленту и пустоту.
  if (!lastReadAt) return null;
  const readUntil = Date.parse(lastReadAt);
  if (Number.isNaN(readUntil)) return null;

  const at = messages.findIndex(
    (message) =>
      // Своё непрочитанным не бывает: его читает собеседник, а не автор.
      message.author.id !== viewerId &&
      Date.parse(message.createdAt) > readUntil,
  );
  return at === -1 ? null : at;
}
