import { readTelegramLaunch, TELEGRAM_WEB_APP_SCRIPT, type TelegramLaunch } from './launch';
// Тип — из нативного двойника (`web-app.ts`): в браузере `./web-app`
// разрешается в этот же файл, но импорт только типа сборка вырезает. Оба
// файла держат один и тот же интерфейс `TelegramWebApp`, включая
// `requestWriteAccess` — иначе типы двух платформ разъедутся молча.
import type { TelegramWebApp } from './web-app';

/**
 * Веб-версия: запуск из Telegram определяется один раз, при загрузке бандла —
 * до того, как роутер перепишет адрес и фрагмент `#tgWebAppData` пропадёт.
 */
export const telegramLaunch: TelegramLaunch | null =
  typeof window === 'undefined' ? null : readTelegramLaunch(window.location.hash);

export type { TelegramWebApp };

let loading: Promise<TelegramWebApp | null> | null = null;

/** Скрипт Telegram — только внутри Telegram и один раз. */
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (!telegramLaunch) return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = TELEGRAM_WEB_APP_SCRIPT;
    script.async = true;
    script.onload = () => {
      const app = (window as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
      resolve(app ?? null);
    };
    // Без скрипта приложение работает: вход идёт по данным из адреса, а
    // «Назад» остаётся своя.
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}
