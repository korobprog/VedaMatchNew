import { parseConferenceToken } from './conference-link';

/**
 * Конференция, в которую человек шёл, когда его остановил вход.
 *
 * На сайте адрес возврата едет в `?returnTo=`: браузер уходит на страницу
 * входа и возвращается по тому же адресу. В приложении такого адреса нет —
 * вход открывает системный браузер и возвращает управление по
 * `vedamatch://auth`, где о конференции уже ничего не известно. Поэтому
 * токен запоминается здесь, а `ConferenceReturn` в корневом стеке забирает
 * его, как только сессия стала «вошёл», — и ведёт человека ровно туда, куда
 * он шёл. В том числе после ПЕРВОГО входа, то есть после регистрации: для
 * приложения это тот же самый путь.
 *
 * В памяти процесса, а не в хранилище: намерение живёт минуты, и
 * пережившее перезапуск «а давай-ка отведём тебя в конференцию» через
 * неделю было бы не помощью, а неожиданностью.
 */
export interface PendingConference {
  /** Запомнить намерение. Мусор молча отбрасывается. */
  remember(link: string | null | undefined): void;
  /** Забрать и забыть: вести человека второй раз в ту же комнату незачем. */
  take(): string | null;
  /** Посмотреть, не забирая. */
  peek(): string | null;
}

export function createPendingConference(): PendingConference {
  let token: string | null = null;
  return {
    remember(link) {
      const parsed = parseConferenceToken(link ?? null);
      // Неразобранное не стирает прежнее намерение: пришедший мусор — это
      // не «человек передумал».
      if (parsed) token = parsed;
    },
    take() {
      const taken = token;
      token = null;
      return taken;
    },
    peek() {
      return token;
    },
  };
}

/** Один на приложение: намерение у человека тоже одно. */
export const pendingConference = createPendingConference();
