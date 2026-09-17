import type { PushFailure } from './push-errors';

/**
 * Чистая часть отправки сообщений через Bot API `sendMessage` (веха 4,
 * «Уведомления через Telegram-бота»): экранирование текста, сборка тела
 * запроса, адрес мини-приложения и разбор ошибок. Сеть, токен бота и
 * повторы — в `TelegramSenderService`.
 */

/** Куда ведёт кнопка «Открыть», когда доставить в конкретный экран
 *  мини-приложения нечем — вся Общение живёт там, остальные сервисы пока нет
 *  (см. границы вехи в `docs/prds/iphone-app.prd.md`). */
export const TELEGRAM_WEBAPP_FALLBACK_PATH = '/';

/**
 * HTML Telegram понимает три спецсимвола вне тегов: `&`, `<`, `>`. Порядок
 * важен — `&` экранируется первым, иначе он же испортит только что вставленные
 * `&lt;`/`&gt;`.
 */
export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Заголовок жирным, тело обычным текстом — тот же порядок, что в браузерном
 *  пуше (`title`/`body`), только оформление под HTML-разметку бота. */
export function buildTelegramMessageText(title: string, body: string): string {
  const heading = `<b>${escapeTelegramHtml(title)}</b>`;
  const trimmedBody = body.trim();
  return trimmedBody
    ? `${heading}\n${escapeTelegramHtml(trimmedBody)}`
    : heading;
}

/**
 * Путь уведомления → путь мини-приложения. Раздел «Общение» — единственный,
 * перенесённый в веб-сборку `apps/mobile` (маршруты `/chat/<id>`,
 * `/chat/requests`); остальные сервисы там не открыть, и ссылка на них вела
 * бы в пустоту, поэтому кнопка ведёт на корень. Якорь `$` в конце — иначе
 * `/chat/with/<id>` (страница портала, а не мини-приложения) прошёл бы по
 * одному общему префиксу с `/chat/<id>`.
 */
const CHAT_ROUTE = /^\/chat\/[^/?#]+(?:\?[^#]*)?$/;

export function mapNotificationUrlToWebAppPath(url: string): string {
  return CHAT_ROUTE.test(url) ? url : TELEGRAM_WEBAPP_FALLBACK_PATH;
}

/** Абсолютный адрес мини-приложения для кнопки `web_app`: Telegram требует
 *  https-ссылку целиком, путь уведомления в неё домонтируется. */
export function buildTelegramWebAppUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export interface TelegramMessageInput {
  /** Личный чат с ботом — id телеграм-пользователя, он же токен устройства. */
  chatId: string;
  title: string;
  body: string;
  /** Путь уведомления (`content.url` из notification-copy.ts), ещё не
   *  отображённый на мини-приложение. */
  notificationUrl: string;
  webAppBaseUrl: string;
}

/** Тело запроса `POST /bot<token>/sendMessage` — без токена: он часть URL,
 *  а не тела, и сюда не попадает ни при каком вызове. */
export function buildTelegramSendMessagePayload(
  input: TelegramMessageInput,
): Record<string, unknown> {
  const path = mapNotificationUrlToWebAppPath(input.notificationUrl);
  return {
    chat_id: input.chatId,
    text: buildTelegramMessageText(input.title, input.body),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть',
            web_app: {
              url: buildTelegramWebAppUrl(input.webAppBaseUrl, path),
            },
          },
        ],
      ],
    },
  };
}

/** `TelegramSenderService.post` решает по этому исходу: `gone` — устройство
 *  протухло (бот заблокирован или чат исчез) и удаляется; `rate-limited` —
 *  подождать `retry_after` и попробовать один раз ещё; `transient` — сеть
 *  или 5xx, тоже одна повторная попытка; `permanent` — всё остальное,
 *  повторять и удалять устройство не за что. */
export type TelegramSendFailure = PushFailure | 'permanent';

function telegramErrorDescription(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const description = (body as { description?: unknown }).description;
  return typeof description === 'string' ? description : '';
}

/**
 * Bot API отвечает `403` на заблокировавшего бота или удалённый аккаунт, и
 * `400` с описанием «chat not found» на чат, которого больше нет (человек
 * стёр переписку с ботом или сам аккаунт Telegram исчез) — оба случая
 * бессмысленно повторять, устройство удаляется.
 */
export function classifyTelegramError(
  status: number,
  body: unknown,
): TelegramSendFailure {
  if (status === 403) return 'gone';
  if (
    status === 400 &&
    /chat not found/i.test(telegramErrorDescription(body))
  ) {
    return 'gone';
  }
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'transient';
  return 'permanent';
}

/** Сколько ждать перед единственным повтором после `429`: значение из
 *  `parameters.retry_after` (секунды), но не дольше `capSeconds` — чужая
 *  оценка паузы не должна держать воркер уведомлений дольше разумного. */
export function telegramRetryAfterMs(body: unknown, capSeconds = 5): number {
  const parameters =
    body && typeof body === 'object'
      ? (body as { parameters?: unknown }).parameters
      : null;
  const raw =
    parameters && typeof parameters === 'object'
      ? (parameters as { retry_after?: unknown }).retry_after
      : null;
  const seconds =
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  return Math.min(seconds, capSeconds) * 1000;
}
