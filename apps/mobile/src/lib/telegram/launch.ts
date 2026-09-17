/**
 * Запуск веб-версии как мини-приложения Telegram (`@vedamatch_bot`).
 *
 * Telegram открывает адрес с фрагментом `#tgWebAppData=…&tgWebAppVersion=…`:
 * по нему видно, что мы внутри Telegram, ещё до загрузки его скрипта. Скрипт
 * `telegram-web-app.js` подключается только тогда — обычному Safari чужой
 * код не нужен.
 */

export const TELEGRAM_WEB_APP_SCRIPT = 'https://telegram.org/js/telegram-web-app.js';

export interface TelegramLaunch {
  /** Подписанные данные запуска — сервер проверяет их ключом бота. */
  initData: string;
  platform: string | null;
  version: string | null;
}

const MAX_INIT_DATA = 10_000;

export function readTelegramLaunch(hash: string): TelegramLaunch | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const initData = params.get('tgWebAppData');
  if (!initData || initData.length > MAX_INIT_DATA) return null;
  return {
    initData,
    platform: params.get('tgWebAppPlatform'),
    version: params.get('tgWebAppVersion'),
  };
}
