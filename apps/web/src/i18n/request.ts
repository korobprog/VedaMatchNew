import { getRequestConfig } from "next-intl/server";
import { getServerLocale } from "./get-locale";

export default getRequestConfig(async () => {
  const locale = await getServerLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
