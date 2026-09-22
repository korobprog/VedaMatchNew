import type { ChatConferenceDto } from "@vedamatch/shared";

/**
 * Панель конференции в комнате: что на ней написано и какие кнопки видны.
 *
 * Правил немного, но каждое из них человек читает в спешке, посреди
 * начавшегося разговора: «сколько ещё работает ссылка», «вход ещё
 * открыт?», «можно ли позвать пятого». Формулировки и видимость кнопок
 * вынесены сюда, потому что проверять их надо таблицей случаев, а не
 * кликами по живому экрану: состояний шесть (открыта, истекла, отозвана —
 * каждое у хозяина и у участника), и вживую до половины из них не дойти.
 *
 * Логика продублирована в `apps/mobile/src/lib/chat/conference-panel.ts`
 * — как и `conferenceSeatsLine` рядом. Общий код сайта и приложения живёт
 * в `@vedamatch/shared`, а тексты интерфейса у нас исторически свои в
 * каждом клиенте; менять этот порядок ради одной панели значило бы
 * тащить в общий пакет половину словаря.
 */

export type ConferencePanelTone = "open" | "closed";

export interface ConferencePanelView {
  /** Заголовок панели: состояние двери одной фразой. */
  title: string;
  /** Что это значит и что делать дальше. */
  hint: string;
  tone: ConferencePanelTone;
  /** Показывать ли саму ссылку и кнопку «скопировать». */
  showLink: boolean;
  /** «Закрыть вход» — только хозяину и только пока вход открыт. */
  showRevoke: boolean;
  /** «Выдать новую ссылку» — хозяину всегда: это и починка, и замена. */
  showRotate: boolean;
  /** Подпись кнопки новой ссылки: «выдать» и «выдать заново» — разное. */
  rotateLabel: string;
}

/**
 * Что показывать в панели. Порядок веток — правило: отзыв сильнее срока,
 * потому что «вход закрыли» — решение человека, а «время вышло» — просто
 * время, и назвать надо именно решение.
 *
 * Нерабочая ссылка не показывается вовсе. Копировать её бессмысленно, а
 * отправленная по ошибке она приводит позванного к отказу — и виноватым
 * он сочтёт себя.
 */
export function conferencePanelView(
  room: Pick<ChatConferenceDto, "state" | "canManage" | "expiresAt">,
  now: Date = new Date(),
): ConferencePanelView {
  const manage = room.canManage;
  if (room.state === "revoked")
    return {
      title: "Вход закрыт",
      hint: manage
        ? "По старой ссылке больше не войдут. Те, кто уже здесь, остались."
        : "Новых по ссылке больше не пускают. Вы остаётесь в комнате.",
      tone: "closed",
      showLink: false,
      showRevoke: false,
      showRotate: manage,
      rotateLabel: "Открыть вход заново",
    };
  if (room.state === "expired")
    return {
      title: "Срок ссылки истёк",
      hint: manage
        ? "Позвать ещё кого-то можно только по новой ссылке."
        : "Новых по этой ссылке уже не позвать. Вы остаётесь в комнате.",
      tone: "closed",
      showLink: false,
      showRevoke: false,
      showRotate: manage,
      rotateLabel: "Выдать новую ссылку",
    };
  return {
    title: "Вход по ссылке открыт",
    hint: conferenceLeftLine(room.expiresAt, now),
    tone: "open",
    showLink: true,
    showRevoke: manage,
    showRotate: manage,
    rotateLabel: "Выдать новую ссылку",
  };
}

/**
 * Сколько ссылке осталось. Здесь, в отличие от карточки приглашения,
 * нужен именно обратный отсчёт: человек в комнате решает «успеем ли
 * позвать ещё», а не «когда встреча».
 *
 * Округление всегда вниз и не мельче минуты: «осталось 0 минут» на
 * работающей ссылке — обман, поэтому последняя минута называется
 * «меньше минуты».
 */
export function conferenceLeftLine(
  expiresAt: string,
  now: Date = new Date(),
): string {
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return "";
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return "Срок ссылки истёк";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Ссылка работает меньше минуты";
  if (minutes < 60)
    return `Ссылка работает ещё ${minutes} ${minuteWord(minutes)}`;
  const hours = Math.floor(minutes / 60);
  return `Ссылка работает ещё ${hours} ${hourWord(hours)}`;
}

/**
 * Подпись у кнопки разговора. Комната конференции — обычная групповая
 * беседа, и звонок в ней тот же самый; человеку важно другое: идёт он или
 * нет, и не занят ли последний стул.
 */
export function conferenceCallCta(
  room: Pick<ChatConferenceDto, "callLive" | "seatsTaken" | "maxParticipants">,
): string {
  if (room.callLive) return "Войти в разговор";
  return "Начать разговор";
}

/** Что сказать после действия. Короткая фраза, а не «успешно». */
export function conferenceActionNote(
  action: "copied" | "revoked" | "rotated",
): string {
  switch (action) {
    case "copied":
      return "Ссылка скопирована";
    case "revoked":
      return "Вход закрыт — по старой ссылке больше не войдут";
    case "rotated":
      return "Новая ссылка готова, старая больше не работает";
  }
}

function minuteWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "минут";
  switch (count % 10) {
    case 1:
      return "минуту";
    case 2:
    case 3:
    case 4:
      return "минуты";
    default:
      return "минут";
  }
}

function hourWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "часов";
  switch (count % 10) {
    case 1:
      return "час";
    case 2:
    case 3:
    case 4:
      return "часа";
    default:
      return "часов";
  }
}
