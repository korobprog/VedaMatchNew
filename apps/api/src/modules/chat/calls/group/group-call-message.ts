import { formatDuration } from '../call-summary';

/**
 * Карточка группового звонка в ленте беседы (жалоба «непонятно, как войти в
 * звонок конференции»): когда комната открывается, в переписке появляется
 * «Групповой звонок · Идёт» с кнопкой входа, когда закрывается — та же
 * карточка становится «завершён · 12:05».
 *
 * Здесь только тексты — что лежит в строке вложения и в теле сообщения.
 * Кнопку, «N из 4» и «Мест нет» рисует клиент по живому состоянию комнаты:
 * в базе они устарели бы через секунду после записи.
 */

export const GROUP_CALL_MESSAGE_TITLE = 'Групповой звонок';

/** Подпись идущего звонка; клиент её не показывает, но она видна в админке. */
export const GROUP_CALL_LIVE_SUBTITLE = 'Идёт';

export interface GroupCallMessageText {
  /** Тело сообщения — то, что видно в списке бесед и в цитате ответа. */
  body: string;
  title: string;
  subtitle: string;
  /** `null`, пока звонок идёт: заполненное поле и значит «завершён». */
  durationSec: number | null;
}

export function groupCallStartedText(): GroupCallMessageText {
  return {
    body: 'Групповой звонок начался',
    title: GROUP_CALL_MESSAGE_TITLE,
    subtitle: GROUP_CALL_LIVE_SUBTITLE,
    durationSec: null,
  };
}

/**
 * Длительность — от открытия комнаты до её закрытия, а не чья-то личная:
 * карточка общая на беседу, и «сколько шёл звонок» у неё одно.
 */
export function groupCallEndedText(
  createdAt: Date,
  endedAt: Date | null,
): GroupCallMessageText {
  const end = endedAt ?? createdAt;
  const seconds = Math.max(
    0,
    Math.round((end.getTime() - createdAt.getTime()) / 1000),
  );
  const duration = formatDuration(seconds);
  return {
    body: `Групповой звонок завершён · ${duration}`,
    title: GROUP_CALL_MESSAGE_TITLE,
    subtitle: duration,
    durationSec: seconds,
  };
}
