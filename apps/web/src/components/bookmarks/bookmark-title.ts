import { SERVICE_CONTENT } from "@/lib/service-content";

/**
 * Как закладка получает подпись и как список разбивается на разделы
 * (VED-163).
 *
 * Чистая логика отдельно от шторки: подпись собирается из заголовка вкладки,
 * а он приходит от каждой страницы портала по-своему — правила проверяются
 * тестом, а не обходом сорока страниц (см. «Тесты» в CLAUDE.md).
 */

/**
 * Хвост, который корневой layout добавляет к заголовку каждой страницы
 * (шаблон `%s — VedaMatch`). Тире отделено пробелами не везде одинаково,
 * поэтому выражением, а не строкой.
 */
const TITLE_SUFFIX = /\s*—\s*VedaMatch$/;

/**
 * Подпись для закладки на текущую страницу.
 *
 * Берём заголовок вкладки: он уже написан по-человечески («Шрила Прабхупада»,
 * «Планировщик»), и ни одна страница ради закладок ничего не объявляет.
 * Хвост портала снимаем — в списке закладок он повторялся бы в каждой строке
 * и съедал ширину. Если заголовка нет вовсе, подписью становится сам путь:
 * это хуже, но честнее пустой строки.
 */
export function bookmarkTitleFrom(documentTitle: string, path: string): string {
  const clean = documentTitle.replace(/\s+/g, " ").trim();
  return clean.replace(TITLE_SUFFIX, "").trim() || path;
}

/** Первый сегмент пути — тем же правилом, что и на сервере. */
export function bookmarkService(path: string): string {
  const segment = (path.split("/")[1] ?? "").split("?")[0];
  return /^[a-z0-9-]+$/.test(segment) ? segment : "";
}

/**
 * Название раздела для заголовка группы. Берётся из общего списка сервисов,
 * а не из своей таблицы: переименование сервиса должно доезжать и сюда.
 * Незнакомый или отсутствующий раздел — «Портал»: туда попадают профиль,
 * баллы, поддержка и главная.
 */
export function bookmarkServiceLabel(
  service: string,
  fallbackNames?: (slug: string, name: string) => string,
): string {
  const known = SERVICE_CONTENT.find((item) => item.slug === service);
  if (!known) return "Портал";
  return fallbackNames ? fallbackNames(known.slug, known.name) : known.name;
}
