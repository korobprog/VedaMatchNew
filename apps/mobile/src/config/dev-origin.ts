/**
 * Адрес API для отладочной сборки.
 *
 * Конфиг вшивается в APK при prebuild, и адрес продового API остаётся в нём
 * навсегда. Отладочная сборка грузит JS с Metro, и API в разработке живёт на
 * той же машине: берём хост Metro из адреса бандла и порт 4000. Явно заданный
 * при сборке адрес (APP_API_ORIGIN) уважаем и не трогаем.
 */

export const DEV_API_PORT = 4000;

export function devApiOrigin(
  scriptUrl: string | null | undefined,
  apiOrigin: string,
  productionOrigins: readonly string[],
): string {
  if (!productionOrigins.includes(apiOrigin)) return apiOrigin;
  if (!scriptUrl) return apiOrigin;
  try {
    const url = new URL(scriptUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return apiOrigin;
    return `http://${url.hostname}:${DEV_API_PORT}`;
  } catch {
    return apiOrigin;
  }
}
