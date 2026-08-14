import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isLocale, type Locale } from "@/lib/locale";

/** Серверная локаль запроса: cookie → Accept-Language → дефолт. Используется
 * и в i18n/request.ts (тексты интерфейса), и при запросах к API (?lang=). */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  const preferred = acceptLanguage?.split(",")[0]?.split("-")[0];
  if (isLocale(preferred)) return preferred;

  return DEFAULT_LOCALE;
}
