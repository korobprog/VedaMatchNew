/**
 * Адрес API для запросов из браузера.
 *
 * `NEXT_PUBLIC_API_URL` вшивается в бандл на сборке, поэтому один деплой мог
 * ходить только в один API. Портал живёт на двух контурах — российском
 * `vedamatch.ru` и глобальном `vedamatch.com`, — и вшитый адрес означал, что
 * браузер на `.com` стучится в API `.ru`. Такой запрос кросс-сайтовый: CORS
 * его режет, а refresh-кука с `sameSite: lax` не отправляется вовсе, то есть
 * вход на втором домене не работает в принципе.
 *
 * Поэтому адрес выбирается по домену страницы: с `vedamatch.com` запросы идут
 * в `api.vedamatch.com`, с `vedamatch.ru` — в `api.vedamatch.ru`. Куки для
 * каждого контура свои, и разделение сессий получается само собой, без единой
 * строчки в коде.
 *
 * Серверный рендер эта функция не трогает: там `window` нет и возвращается
 * прежнее значение переменной. Запросы из серверных компонентов всё так же
 * идут по внутреннему адресу `API_INTERNAL_URL` (см. `lib/api.ts`).
 */

/**
 * Домены верхнего уровня, на которых живут контуры портала. Список нужен,
 * чтобы не трогать превью-деплои (`*.sslip.io`), локальную разработку и любой
 * другой хост: для них остаётся значение из переменной.
 */
const CONTOUR_TLDS = new Set(["ru", "com"]);

/**
 * Адрес API для страницы, открытой на `hostname`. Правило: у контура
 * `<имя>.<зона>` API живёт на `api.<имя>.<зона>`, поддомены портала
 * (`www`, `vaishnava`) ходят туда же. Всё незнакомое — на `fallback`.
 */
export function resolveApiBase(
  hostname: string | null | undefined,
  fallback: string,
): string {
  if (typeof hostname !== "string") return fallback;
  const host = hostname.trim().toLowerCase();
  if (host.length === 0) return fallback;

  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return fallback;

  const tld = labels[labels.length - 1];
  const name = labels[labels.length - 2];
  if (!CONTOUR_TLDS.has(tld)) return fallback;
  // Хост вида 64.130.62.129 до сюда не доходит: числовая зона не в списке.
  // А вот сам API-домен исключаем явно — страниц там нет, но если кто-то
  // откроет, пусть не собирается `api.api.…`.
  if (labels[0] === "api" && labels.length === 3) return fallback;

  return `https://api.${name}.${tld}`;
}

/** Значение переменной сборки — оно же ответ для сервера и незнакомых хостов. */
export function configuredApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

/**
 * Адрес API для текущей страницы. На сервере — значение переменной, в
 * браузере — контур по домену.
 */
export function apiBase(): string {
  const fallback = configuredApiBase();
  if (typeof window === "undefined") return fallback;
  return resolveApiBase(window.location.hostname, fallback);
}
