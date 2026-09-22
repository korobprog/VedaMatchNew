import type { ChatConferenceInviteDto } from '@vedamatch/shared';

/**
 * Ссылка на быструю конференцию глазами приложения (VED-360).
 *
 * Разбор ссылки и решение «что показать открывшему» — чистым модулем, без
 * навигации и запросов: ошибка здесь видна только вживую и только одному
 * человеку, тому, кого позвали, — а значит проверяться должна таблицей
 * случаев, а не установкой APK на телефон.
 *
 * Копия правил сервера, а не импорт: по контракту сервисного модуля общие
 * помощники дублируются. Импортировать код API в приложение всё равно
 * нельзя, зато оба набора правил проверены своими тестами.
 */

/** Ровно 32 символа base64url — форма токена, которую выдаёт сервер. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Сегмент пути короткой ссылки: `vedamatch.ru/j/<токен>`. */
const PREFIX = 'j';

/**
 * Токен из адреса, каким его отдаёт система: `vedamatch://j/<токен>` от
 * своей схемы, `https://vedamatch.ru/j/<токен>` от ссылки в мессенджере,
 * и просто хвост — когда человек скопировал его руками.
 *
 * Ничего не «чинит»: похожие символы в base64url значат разное, и
 * исправленный токен — это стук в чужую дверь.
 */
export function parseConferenceToken(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const raw = link.trim();
  if (!raw) return null;
  const segments = raw.split(/[?#]/)[0].split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || !TOKEN.test(last)) return null;
  if (segments.length === 1) return last;
  return segments[segments.length - 2] === PREFIX ? last : null;
}

export type ConferenceScreenStep =
  /** Карточка приглашения ещё не пришла. */
  | { kind: 'loading' }
  /** Вошедший, и его пускают: входим сами и уводим в комнату. */
  | { kind: 'enter'; note: string }
  /** Гость: вход, и сразу обратно сюда. */
  | { kind: 'sign-in'; action: string }
  | { kind: 'denied'; title: string; text: string };

/**
 * Что делает экран приглашения. Порядок проверок — это и есть правило:
 * сбой важнее карточки, отказ важнее приглашения войти (гнать человека
 * заводить аккаунт ради закрытой двери нельзя), и только потом развилка
 * «гость или свой».
 */
export function conferenceScreenStep(input: {
  signedIn: boolean;
  invite: ChatConferenceInviteDto | null;
  error?: string | null;
}): ConferenceScreenStep {
  if (input.error)
    return {
      kind: 'denied',
      title: 'Конференция не открылась',
      text: input.error,
    };
  if (!input.invite) return { kind: 'loading' };
  if (input.invite.denial)
    return {
      kind: 'denied',
      title: 'Войти не получится',
      text: input.invite.denial,
    };
  if (!input.signedIn)
    return { kind: 'sign-in', action: 'Войти и присоединиться' };
  return {
    kind: 'enter',
    note: input.invite.alreadyMember
      ? 'Возвращаем вас в конференцию…'
      : 'Входим в конференцию…',
  };
}

/** Строка про места: про потолок человек узнаёт до входа, а не отказом пятым. */
export function conferenceSeatsLine(room: {
  seatsTaken: number;
  maxParticipants: number;
}): string {
  const free = Math.max(room.maxParticipants - room.seatsTaken, 0);
  if (free === 0) return `Мест нет: заняты все ${room.maxParticipants}`;
  return `Занято ${room.seatsTaken} из ${room.maxParticipants} — свободно ещё ${free} ${placeWord(free)}`;
}

export function conferenceCallLine(room: { callLive: boolean }): string {
  return room.callLive
    ? 'Разговор уже идёт'
    : 'Разговор ещё не начался — начнёте вы';
}

/** Что отправляют вместе со ссылкой, открыв системное «Поделиться». */
export function conferenceShareText(url: string): string {
  return `Заходите в конференцию: ${url}`;
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
