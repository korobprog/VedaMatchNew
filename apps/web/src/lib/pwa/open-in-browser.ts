/** Пакеты браузеров, умеющих чеканить WebAPK (см. installsAsStandaloneApp). */
export const chromeAndroidPackage = "com.android.chrome";
export const samsungAndroidPackage = "com.sec.android.app.sbrowser";

/**
 * Ссылка `intent://`, открывающая тот же адрес в конкретном браузере Android.
 *
 * `scheme=` в описании обязателен: без него Android не знает, чем заменить
 * `intent://`, и переход молча не происходит. Собственный фрагмент адреса
 * приходится отбрасывать — место после `#` занято самим описанием Intent.
 *
 * Намеренно без `S.browser_fallback_url`: fallback открылся бы в том же
 * браузере, из которого мы уходим, и человек решил бы, что всё сработало.
 * Отсутствие Chrome ловится тем, что страница осталась видимой.
 */
export function buildAndroidIntentUrl(
  href: string,
  packageName: string,
): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const scheme = url.protocol.slice(0, -1);
  const target = `${url.host}${url.pathname}${url.search}`;
  return `intent://${target}#Intent;scheme=${scheme};package=${packageName};end`;
}
