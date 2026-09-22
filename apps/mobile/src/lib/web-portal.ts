/**
 * Переход из приложения в полную веб-версию портала (кнопка «Открыть сайт»
 * в правом верхнем углу экранов входа, `components/web-portal-button.tsx`).
 *
 * Нативно сделана лишь часть сервисов, поэтому человеку нужен выход в
 * портал целиком — в том числе до входа, когда в приложении ему больше
 * ничего не доступно.
 *
 * Адрес не зашит: контур сборки решает, куда идти (`config/variant.ts`).
 * Российская сборка открывает `vedamatch.ru`, глобальная — `vedamatch.com`.
 *
 * Одноразового входа по ссылке (перенос сессии приложения в браузер) в
 * портале нет: `auth/app/*` и PKCE (`lib/auth/login-flow.ts`,
 * `apps/api/src/modules/auth/app-login.ts`) устроены в обратную сторону —
 * браузер отдаёт приложению код. Да и предъявлять на экране входа нечего:
 * сессии там ещё нет. Поэтому открываем портал как гостя.
 *
 * Модуль чистый: браузер приходит зависимостями, чтобы поведение при
 * недоступном браузере проверялось тестом, а не только на телефоне.
 */

/** Подпись кнопки. Одна строка на все экраны входа — расхождений быть не должно. */
export const WEB_PORTAL_LABEL = 'Открыть сайт';

/** Пояснение для скринридера: куда именно ведёт кнопка. */
export const WEB_PORTAL_HINT = 'Откроется полная веб-версия портала в браузере';

/**
 * Адрес портала для перехода. Гостю нужна главная: разделов, доступных без
 * входа, всё равно почти нет, а лендинг сам уводит на нужный вход.
 */
export function webPortalUrl(webOrigin: string): string {
  return webOrigin.replace(/\/+$/, '');
}

/** Адрес без протокола — так его называют людям («откройте vedamatch.ru»). */
export function webPortalHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** Текст отказа: назвать адрес обязательно, иначе совет «откройте вручную» пустой. */
export function webPortalUnavailableMessage(url: string): string {
  return `Не удалось открыть браузер. Откройте ${webPortalHost(url)} вручную.`;
}

export interface WebPortalOpener {
  /** Вкладка внутри приложения (Chrome Custom Tabs, `expo-web-browser`). */
  openBrowser(url: string): Promise<unknown>;
  /** Запасной путь: отдать адрес системе (`Linking.openURL`). */
  openLink(url: string): Promise<unknown>;
}

export type OpenWebPortalResult =
  | { kind: 'opened'; via: 'browser' | 'link' }
  | { kind: 'failed'; message: string };

/**
 * Открыть портал. На телефоне без Chrome и без другого браузера с поддержкой
 * Custom Tabs `openBrowserAsync` отказывает — тогда пробуем системный
 * обработчик ссылок, и только если и он отказал, признаём неудачу: тупик с
 * молчащей кнопкой хуже честного текста с адресом.
 */
export async function openWebPortal(
  url: string,
  opener: WebPortalOpener,
): Promise<OpenWebPortalResult> {
  try {
    await opener.openBrowser(url);
    return { kind: 'opened', via: 'browser' };
  } catch {
    // Custom Tabs недоступны — ниже системный браузер.
  }
  try {
    await opener.openLink(url);
    return { kind: 'opened', via: 'link' };
  } catch {
    return { kind: 'failed', message: webPortalUnavailableMessage(url) };
  }
}
