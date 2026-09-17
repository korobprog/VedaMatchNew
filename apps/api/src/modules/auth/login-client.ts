import type { LoginClient } from '@vedamatch/shared';

/**
 * Куда пишется `LoginClient` (тип и правила его значений — в
 * `@vedamatch/shared`, там же используется вебом и статистикой):
 *
 * - `telegram` — мини-приложение `@vedamatch_bot`
 *   (`AuthService.loginWithTelegramWebApp`).
 * - `android` — вход по PKCE, который завершает нативное приложение
 *   (`AppLoginRequest` присутствует в `issueSessionAndRedirect`, код заберёт
 *   `exchangeAppLoginCode`).
 * - `web-app` — OAuth-вход, вернувшийся не на основной портал контура, а на
 *   его поддомен (`ios.vedamatch.com`) — веб-сборка приложения.
 * - `site` — обычный вход на сам портал.
 */
export type { LoginClient };

export type LoginClientInput =
  | { kind: 'telegram' }
  | { kind: 'app' }
  | {
      kind: 'oauth';
      /** Итог `resolveReturnOrigin` — куда реально вернётся человек. */
      resolvedOrigin: string;
      /** `Contour.webOrigin` — портал того же контура. */
      contourWebOrigin: string;
    };

/**
 * Чистая функция без побочных эффектов: и `resolveReturnOrigin`, и решение
 * «это приложение» уже приняты вызывающим, здесь только сведение их в одно
 * значение для журнала.
 */
export function resolveLoginClient(input: LoginClientInput): LoginClient {
  switch (input.kind) {
    case 'telegram':
      return 'telegram';
    case 'app':
      return 'android';
    case 'oauth':
      return input.resolvedOrigin === input.contourWebOrigin
        ? 'site'
        : 'web-app';
  }
}
