import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramBotStatusResponse } from '@vedamatch/shared';
import {
  buildTelegramSendMessagePayload,
  classifyTelegramError,
  telegramRetryAfterMs,
  type TelegramSendFailure,
} from './telegram-message';

/** Bot API не отвечает за это время сам — вешать воркер уведомлений на нём
 *  ожиданием сети нельзя. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Отправка сообщений от `@vedamatch_bot` через Bot API `sendMessage`.
 * Сеть, токен и адрес API — здесь; текст сообщения, кнопка и разбор ошибок —
 * в `telegram-message.ts` (чистая часть, своя `*.spec.ts`).
 *
 * Токен в логи не попадает никогда — он часть URL запроса, поэтому в логах
 * фигурирует только имя метода Bot API, не сам адрес.
 */
@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);
  private readonly botToken: string | null;
  private readonly apiBase: string;
  private readonly webAppBaseUrl: string;

  constructor(config: ConfigService) {
    this.botToken = config.get<string>('TELEGRAM_BOT_TOKEN') || null;
    this.apiBase = (
      config.get<string>('TELEGRAM_API_BASE_URL') || 'https://api.telegram.org'
    ).replace(/\/+$/, '');
    this.webAppBaseUrl =
      config.get<string>('TELEGRAM_WEBAPP_URL') || 'https://ios.vedamatch.com';
  }

  get configured(): boolean {
    return this.botToken !== null;
  }

  /**
   * Никогда не бросает: вызывается из слушателя события, где необработанное
   * отклонение уронило бы процесс уведомлений целиком.
   *
   * `null` — доставлено. `'gone'` — устройство протухло (бот заблокирован
   * или чат исчез), вызывающий должен его удалить. Остальное — не
   * доставлено; при `'rate-limited'` и `'transient'` уже сделан один повтор.
   */
  async sendMessage(params: {
    chatId: string;
    title: string;
    body: string;
    notificationUrl: string;
  }): Promise<TelegramSendFailure | null> {
    if (!this.botToken) return 'permanent';
    const payload = buildTelegramSendMessagePayload({
      chatId: params.chatId,
      title: params.title,
      body: params.body,
      notificationUrl: params.notificationUrl,
      webAppBaseUrl: this.webAppBaseUrl,
    });

    const first = await this.attempt(payload);
    if (first.ok) return null;

    // Ровно один повтор: `rate-limited` — после паузы Telegram
    // (`retry_after`, не больше 5 с), `transient` — сразу, сеть или 5xx
    // могли отпустить за то время, что ушло на первую попытку.
    if (first.failure === 'rate-limited' || first.failure === 'transient') {
      if (first.failure === 'rate-limited' && first.retryAfterMs > 0) {
        await sleep(first.retryAfterMs);
      }
      const second = await this.attempt(payload);
      if (second.ok) return null;
      this.logger.warn(`sendMessage не доставлен: ${second.failure}`);
      return second.failure;
    }

    this.logger.warn(`sendMessage не доставлен: ${first.failure}`);
    return first.failure;
  }

  /**
   * `GET /notifications/telegram/status` (админка): проверка с прода, что
   * сервер вообще достаёт до Telegram, — тот же приём, что тестовый пуш себе
   * в `NotificationDevicesAdminController`, только вместо телефона он бьёт в
   * сам Bot API. Не бросает: недоступность бота — это ответ, а не 500.
   */
  async getBotStatus(): Promise<TelegramBotStatusResponse> {
    if (!this.botToken) {
      return { configured: false, reachable: false, username: null };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${this.apiBase}/bot${this.botToken}/getMe`,
        {
          signal: controller.signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);
      const result =
        body && typeof body === 'object'
          ? (body as { ok?: unknown; result?: { username?: unknown } })
          : null;
      const reachable = response.ok && result?.ok === true;
      const username =
        reachable && typeof result?.result?.username === 'string'
          ? result.result.username
          : null;
      return { configured: true, reachable, username };
    } catch {
      return { configured: true, reachable: false, username: null };
    } finally {
      clearTimeout(timer);
    }
  }

  private async attempt(
    payload: Record<string, unknown>,
  ): Promise<
    | { ok: true }
    | { ok: false; failure: TelegramSendFailure; retryAfterMs: number }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${this.apiBase}/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      if (response.ok) return { ok: true };
      const body: unknown = await response.json().catch(() => null);
      return {
        ok: false,
        failure: classifyTelegramError(response.status, body),
        retryAfterMs: telegramRetryAfterMs(body),
      };
    } catch {
      // Таймаут или сеть недоступна — сообщение без деталей ошибки: у
      // `fetch` бывает адрес запроса в тексте, а в нём токен бота.
      return { ok: false, failure: 'transient', retryAfterMs: 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
