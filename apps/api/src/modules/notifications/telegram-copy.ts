import type { NotificationEvent } from '@vedamatch/shared';
import type { NotificationContent } from './notification-copy';

/**
 * Текст браузерного пуша не всегда подходит боту один в один: входящий
 * звонок там — просто имя звонящего и короткая подпись («Входящий
 * аудиозвонок»), а в переписке с ботом это сообщение лежит вперемешку с
 * другими его сообщениями, и эмодзи с явным «Входящий звонок от…» находится
 * быстрее беглым взглядом. Остальные события боту уходят как есть — второй
 * копирайт им заводить незачем.
 */
export function buildTelegramNotificationText(
  content: NotificationContent,
  event: NotificationEvent,
): { title: string; body: string } {
  if (event.name === 'chat.call-incoming') {
    return {
      title: content.title,
      body: `📞 Входящий звонок от ${event.callerName}`,
    };
  }
  return { title: content.title, body: content.body };
}
