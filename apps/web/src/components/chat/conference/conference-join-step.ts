import type { ChatConferenceInviteDto } from "@vedamatch/shared";
import { loginHref } from "@/lib/return-to";

/**
 * Что делает экран, на который привела ссылка конференции.
 *
 * Правил тут немного, но каждое из них — это развилка, на которой человек
 * либо попадает в комнату, либо теряется: вошедшего надо вести дальше
 * молча, гостя — на вход и обратно ровно сюда, а тому, кому войти нельзя,
 * сказать причину и следующий шаг. Ошибка видна только вживую и только
 * одному человеку — тому, кого позвали, — поэтому правила вынесены сюда и
 * проверяются таблицей случаев.
 */

/** Путь страницы приглашения: он же — адрес возврата после входа. */
export function conferenceLinkPath(token: string): string {
  return `/j/${token}`;
}

/**
 * Куда уводить гостя. `loginHref` — тот же, что у остальных страниц
 * портала: `?returnTo=` разбирает proxy.ts, а после входа (в том числе
 * ПЕРВОГО, то есть регистрации) API возвращает браузер ровно по этому пути.
 * Страница `/j/<токен>` числится в `publicPrefixes`, поэтому промежуточного
 * редиректа на лендинг не случается и адрес возврата не теряется.
 */
export function conferenceLoginHref(token: string): string {
  return loginHref(conferenceLinkPath(token));
}

/**
 * Та же ссылка, но для приложения.
 *
 * `https://vedamatch.ru/j/<токен>` открывается сайтом: проверенных
 * app-links у домена нет, и Android с iOS ведут такую ссылку в браузер.
 * Поэтому на карточке приглашения стоит отдельный переход по собственной
 * схеме — `vedamatch://j/<токен>`, который приложение разбирает тем же
 * экраном `j/[token]`.
 *
 * Это и есть путь «приложение не установлено → сайт», только в честную
 * сторону: по умолчанию человек остаётся на сайте и входит там, а в
 * приложение уходит, если сам нажал. Схема, которую некому открыть,
 * ничего не делает, и человек остаётся на той же странице — потерять его
 * такой ссылкой нельзя.
 */
export function conferenceAppLink(token: string): string {
  return `vedamatch://j/${token}`;
}

export type ConferenceJoinStep =
  /** Ещё не знаем: карточка приглашения не пришла. */
  | { kind: "loading" }
  /** Вошедший и его пускают — дальше без единого экрана. */
  | { kind: "enter"; note: string }
  /** Гость: вход или регистрация, и сразу обратно сюда. */
  | { kind: "sign-in"; href: string; action: string }
  /** Войти нельзя — причина и следующий шаг. */
  | { kind: "denied"; title: string; text: string };

export function conferenceJoinStep(input: {
  token: string;
  signedIn: boolean;
  invite: ChatConferenceInviteDto | null;
  /** Ссылка вовсе не открылась: её нет, она кривая или API молчит. */
  error?: string | null;
}): ConferenceJoinStep {
  if (input.error)
    return {
      kind: "denied",
      title: "Конференция не открылась",
      text: input.error,
    };
  if (!input.invite) return { kind: "loading" };

  // Отказ показывается раньше входа: гнать гостя заводить аккаунт ради
  // комнаты, куда его всё равно не пустят, — издевательство.
  if (input.invite.denial)
    return {
      kind: "denied",
      title: "Войти не получится",
      text: input.invite.denial,
    };

  if (!input.signedIn)
    return {
      kind: "sign-in",
      href: conferenceLoginHref(input.token),
      // Регистрации отдельной в портале нет: первый вход и есть
      // регистрация, и человеку честнее сказать это заранее.
      action: "Войти и присоединиться",
    };

  return {
    kind: "enter",
    note: input.invite.alreadyMember
      ? "Возвращаем вас в конференцию…"
      : "Входим в конференцию…",
  };
}

/**
 * Строка про места на карточке приглашения. Про потолок человек узнаёт
 * здесь — до входа, а не отказом пятым.
 */
export function conferenceSeatsLine(room: {
  seatsTaken: number;
  maxParticipants: number;
}): string {
  const free = Math.max(room.maxParticipants - room.seatsTaken, 0);
  if (free === 0) return `Мест нет: заняты все ${room.maxParticipants}`;
  return `Занято ${room.seatsTaken} из ${room.maxParticipants} — свободно ещё ${free} ${placeWord(free)}`;
}

/** Идёт ли разговор прямо сейчас — это меняет обещание кнопки. */
export function conferenceCallLine(room: { callLive: boolean }): string {
  return room.callLive
    ? "Разговор уже идёт"
    : "Разговор ещё не начался — начнёте вы";
}

/**
 * До какого часа ссылка работает. Дата, а не «осталось 7 часов»: человек
 * пересылает ссылку дальше, и получателю нужен срок, а не обратный отсчёт,
 * посчитанный в чужую секунду.
 */
export function conferenceExpiryLine(
  expiresAt: string,
  now: Date = new Date(),
): string {
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return "";
  if (at.getTime() <= now.getTime()) return "Срок ссылки истёк";
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `Ссылка работает до ${time}`;
  const date = at.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  return `Ссылка работает до ${date}, ${time}`;
}

function placeWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "мест";
  switch (count % 10) {
    case 1:
      return "место";
    case 2:
    case 3:
    case 4:
      return "места";
    default:
      return "мест";
  }
}
