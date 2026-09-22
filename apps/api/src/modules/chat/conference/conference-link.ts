import { randomBytes } from 'node:crypto';
import {
  CHAT_CONFERENCE_LINK_PATH,
  CHAT_CONFERENCE_LINK_TTL_HOURS,
  CHAT_CONFERENCE_TOKEN_LENGTH,
  CHAT_GROUP_CALL_MAX_PARTICIPANTS,
  type ChatConferenceLinkState,
} from '@vedamatch/shared';

/**
 * Правила ссылки на быструю конференцию — чистым модулем, без Prisma и Nest.
 *
 * Здесь собрано всё, что решает судьбу приглашённого: как выглядит токен,
 * сколько живёт ссылка, кого пускать и что человеку сказать, если не
 * пускаем. Ошибка в каждой из этих строк — это либо угадываемая ссылка,
 * либо дверь, которую невозможно закрыть, либо пятый участник, от которого
 * разговор рассыпается у всех четверых. Проверять такое надо таблицей
 * случаев, а не поднятой базой, — отсюда и отдельный модуль, как у
 * `group-call-room.ts` рядом и `work-invite.ts` в «Работе».
 *
 * Комната конференции — обычная групповая беседа (см. докстрингу
 * `chat-conference.service.ts`), поэтому потолок здесь тот же, что у
 * группового звонка: `CHAT_GROUP_CALL_MAX_PARTICIPANTS`. Отдельной
 * «вместимости конференции» нет намеренно: два числа разъедутся, и портал
 * начнёт звать пятого в комнату, из которой его выставит звонок.
 */

/** 24 байта → ровно 32 символа base64url. 192 бита: перебор не окупается. */
export const CONFERENCE_TOKEN_BYTES = 24;

export const CONFERENCE_TOKEN_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${CHAT_CONFERENCE_TOKEN_LENGTH}}$`,
);

export const CONFERENCE_MAX_PARTICIPANTS = CHAT_GROUP_CALL_MAX_PARTICIPANTS;

/**
 * Новый токен. Источник случайности внедряется, чтобы тест проверял форму
 * и длину, а не пересказывал `randomBytes`.
 */
export function createConferenceToken(
  bytes: (size: number) => Buffer = randomBytes,
): string {
  return bytes(CONFERENCE_TOKEN_BYTES).toString('base64url');
}

/**
 * Токен из адресной строки. Ничего не «чинит»: похожие символы в base64url
 * значат разное, и исправленный токен — это вход в чужую комнату.
 */
export function normalizeConferenceToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return CONFERENCE_TOKEN_PATTERN.test(token) ? token : null;
}

/** Ссылка целиком: её копируют и пересылают. */
export function conferenceLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${CHAT_CONFERENCE_LINK_PATH}${token}`;
}

/**
 * Токен из присланного адреса: и `https://vedamatch.ru/j/<токен>`, и
 * `vedamatch://j/<токен>` из приложения. Разбор нужен и вебу, и телефону,
 * и серверу — поэтому не регуляркой по всей строке, а по последнему
 * сегменту пути: домен портала у нас не один, а хвост ссылки один и тот же.
 */
export function parseConferenceToken(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const raw = link.trim();
  if (!raw) return null;
  const withoutQuery = raw.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  // Голый токен без адреса — это тоже ссылка: человек скопировал хвост.
  if (segments.length === 1) return normalizeConferenceToken(last);
  // Предпоследний сегмент обязан быть «j»: `/chat/j/<токен>` и
  // `/что-угодно/<токен>` — разные вещи, и вторую принимать нельзя.
  const prefix = CHAT_CONFERENCE_LINK_PATH.replace(/\//g, '');
  return segments[segments.length - 2] === prefix
    ? normalizeConferenceToken(last)
    : null;
}

/** До какого момента ссылка работает. */
export function conferenceLinkExpiry(
  now: Date,
  hours: number = CHAT_CONFERENCE_LINK_TTL_HOURS,
): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Что со ссылкой на момент `now`. Отозванная остаётся отозванной, даже
 * когда её срок ещё не вышел: «закрыл вход» — более сильное решение, чем
 * «время не пришло», и человеку надо назвать именно его.
 */
export function conferenceLinkState(
  link: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): ChatConferenceLinkState {
  if (link.revokedAt) return 'revoked';
  return link.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active';
}

export type ConferenceJoinDenial = 'expired' | 'revoked' | 'full' | 'blocked';

export type ConferenceJoinDecision =
  /** Новый участник: добавляем в беседу и ведём в комнату. */
  | { kind: 'enter' }
  /** Он уже внутри: ссылка просто возвращает его в свою комнату. */
  | { kind: 'return' }
  | { kind: 'deny'; reason: ConferenceJoinDenial };

/**
 * Пускать ли открывшего ссылку.
 *
 * Порядок проверок — это и есть правило. Свой идёт первым: отзыв ссылки и
 * её срок закрывают дверь для ЧУЖИХ, а человека, который уже в комнате, они
 * выставить не могут — у него беседа и так в списке, и ссылка для него лишь
 * короткий путь обратно. Потолок проверяется последним: он про комнату в
 * эту секунду, а не про ссылку, и освободившееся место тут же снова делает
 * вход возможным. Блокировка идёт сразу за «своим»: она сильнее и срока, и
 * отзыва, но человека, уже сидящего в комнате, из неё не выкидывает — это
 * решение хозяина, а не побочный эффект ссылки.
 */
export function conferenceJoinDecision(
  room: {
    state: ChatConferenceLinkState;
    seatsTaken: number;
    alreadyMember: boolean;
    /** Взаимная блокировка с хозяином комнаты. */
    blockedWithHost?: boolean;
  },
  maxParticipants: number = CONFERENCE_MAX_PARTICIPANTS,
): ConferenceJoinDecision {
  if (room.alreadyMember) return { kind: 'return' };
  // Блокировка сильнее ссылки: пересланная в общий чат, она иначе провела
  // бы к человеку ровно того, от кого он закрылся.
  if (room.blockedWithHost) return { kind: 'deny', reason: 'blocked' };
  if (room.state === 'revoked') return { kind: 'deny', reason: 'revoked' };
  if (room.state === 'expired') return { kind: 'deny', reason: 'expired' };
  if (room.seatsTaken >= maxParticipants)
    return { kind: 'deny', reason: 'full' };
  return { kind: 'enter' };
}

/**
 * Что человек читает вместо комнаты. Про потолок говорим числом и заранее —
 * приглашённый должен понимать, что мест конечное число, ещё на карточке
 * приглашения, а не упираться в отказ пятым.
 */
export function conferenceDenialText(
  reason: ConferenceJoinDenial,
  maxParticipants: number = CONFERENCE_MAX_PARTICIPANTS,
): string {
  switch (reason) {
    case 'revoked':
      return 'Вход по этой ссылке закрыли. Попросите новую у того, кто вас позвал.';
    case 'expired':
      return 'Срок ссылки истёк. Попросите новую у того, кто вас позвал.';
    case 'blocked':
      return 'Эта конференция вам недоступна.';
    case 'full':
      return `В конференции уже ${maxParticipants} ${peopleWord(maxParticipants)} — это предел. Попросите начать вторую или подождите, пока кто-нибудь выйдет.`;
  }
}

/**
 * Подпись про места на карточке приглашения. Не украшение: это единственное
 * место, где человек узнаёт про потолок ДО того, как упрётся в него.
 */
export function conferenceSeatsHint(
  seatsTaken: number,
  maxParticipants: number = CONFERENCE_MAX_PARTICIPANTS,
): string {
  const free = Math.max(maxParticipants - seatsTaken, 0);
  if (free === 0) return `Мест нет: заняты все ${maxParticipants}`;
  return `Занято ${seatsTaken} из ${maxParticipants} — свободно ещё ${free} ${placeWord(free)}`;
}

/**
 * Название комнаты, когда человек не стал его придумывать. Имя хозяина, а
 * не «Конференция №17»: в списке бесед у приглашённого должно быть видно,
 * к кому он идёт.
 */
export function conferenceTitle(
  hostName: string,
  custom?: string | null,
): string {
  const chosen = typeof custom === 'string' ? custom.trim() : '';
  if (chosen) return chosen.slice(0, 120);
  const name = hostName.trim();
  return name ? `Конференция · ${name}` : 'Быстрая конференция';
}

function peopleWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'человек';
  switch (count % 10) {
    case 1:
      return 'человек';
    case 2:
    case 3:
    case 4:
      return 'человека';
    default:
      return 'человек';
  }
}

function placeWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'мест';
  switch (count % 10) {
    case 1:
      return 'место';
    case 2:
    case 3:
    case 4:
      return 'места';
    default:
      return 'мест';
  }
}
