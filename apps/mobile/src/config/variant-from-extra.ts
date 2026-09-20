import type { AppVariant } from './variant';

/**
 * Разбор `extra.variant` из собранного приложения.
 *
 * `expo config` сериализует конфиг через `JSON`-совместимый слой, и `null`
 * из `app.config.ts` доезжает до сборки **пустым объектом**: проверено
 * `expo config --json` без `APP_DOWNLOAD_BASE_URL` —
 * `extra.variant.downloadBaseUrl` равен `{}`, а не `null`. Дальше
 * `manifestUrl()` звал `.trim()` на объекте и валил экран «Сервисы» вместо
 * честной надписи «Адрес обновлений не настроен в этой сборке» (VED-176).
 *
 * Поэтому необязательные строки приводим к `string | null` здесь, в одном
 * месте, а не в каждом потребителе.
 */
export function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param raw — значение `Constants.expoConfig?.extra?.variant`.
 * @returns вариант сборки с починенными необязательными полями.
 * @throws если варианта нет вовсе — сборка без `app.config.ts`.
 */
export function variantFromExtra(raw: unknown): AppVariant {
  if (!raw || typeof raw !== 'object') {
    throw new Error('В сборке нет extra.variant: приложение собрано без app.config.ts');
  }
  const variant = raw as AppVariant;
  return { ...variant, downloadBaseUrl: nullableString(variant.downloadBaseUrl) };
}
