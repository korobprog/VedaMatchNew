/**
 * Какую сессию использует веб-сборка на старте (`session.web.tsx`).
 *
 * По умолчанию (обычный браузер на `vedamatch.com`/`ios.vedamatch.com`) —
 * `cookie`: пара токенов в httpOnly cookie на домене портала, вход/выход
 * маршрутами сайта.
 *
 * Внутри Telegram (мини-приложение) — всегда `telegram-token`, независимо от
 * того, top-level это WebView (телефон) или `<iframe>` на чужом происхождении
 * (Telegram Desktop, web.telegram.org): во втором случае cookie портала для
 * страницы третьесторонняя и браузер её режет, а решение действовать
 * одинаково в обоих случаях проще и надёжнее, чем определять, в iframe мы или
 * нет (сама детекция iframe в разных браузерах не абсолютно надёжна).
 * Токены живут только в памяти процесса (`token-authority.ts` поверх
 * `token-store.web.ts`, который на вебе ничего не пишет ни в `localStorage`,
 * ни в `sessionStorage`) — мини-приложение выполняет чужой код с
 * telegram.org, и постоянное хранилище было бы читаемо этим кодом (XSS).
 * Перезагрузка страницы стирает токены, но Telegram при каждом открытии
 * заново передаёт свежие данные запуска в адресе — повторный вход происходит
 * автоматически, без экрана логина.
 */
export type WebSessionStrategy = 'cookie' | 'telegram-token';

export function resolveWebSessionStrategy(launchedInTelegram: boolean): WebSessionStrategy {
  return launchedInTelegram ? 'telegram-token' : 'cookie';
}
