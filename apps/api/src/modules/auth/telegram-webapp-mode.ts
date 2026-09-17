import { BadRequestException } from '@nestjs/common';

/**
 * Режим ответа входа мини-приложения Telegram (`POST /auth/telegram/webapp`).
 *
 * По умолчанию (поле отсутствует) — вход как раньше: cookie-сессия на домене
 * портала. Телефоны открывают мини-приложение в top-level WebView, и первая
 * (сторонняя) cookie там доступна как обычная.
 *
 * `token` — для Telegram Desktop и web.telegram.org: там мини-приложение
 * живёт в `<iframe>` на чужом происхождении, и cookie портала третьесторонняя
 * — браузер её режет. Вместо cookie сервис отдаёт пару токенов в теле ответа,
 * тем же путём, что и обмен кода приложения (`exchangeAppLoginCode`).
 */
export type TelegramWebAppMode = 'cookie' | 'token';

/**
 * Разбор поля `mode` из тела запроса. Строгая проверка: любое значение, кроме
 * отсутствующего и `'token'`, — 400, а не молчаливый откат на cookie. Молчаливый
 * откат спрятал бы опечатку клиента за поведением, которое выглядит рабочим
 * только на телефоне (там cookie не третьесторонняя).
 */
export function parseTelegramWebAppMode(mode: unknown): TelegramWebAppMode {
  if (mode === undefined) return 'cookie';
  if (mode === 'token') return 'token';
  throw new BadRequestException('Неизвестный режим входа');
}
