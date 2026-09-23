/**
 * Чистая часть маршрута `/m/<slug>/story` — вынесена, чтобы проверять тестом
 * без сети и без Next.
 */

/**
 * Имя файла в «Загрузках» и в шторке «Поделиться»: «vedamatch-<slug>.jpg»
 * узнаётся, а случайный ключ хранилища — нет. Расширение — по фактическому
 * типу: файл `.jpg` с PNG внутри часть приложений не берёт.
 */
export function storyFileName(slug: string, contentType: string | null): string {
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const extension =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const safe = slug.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `vedamatch-${safe || "card"}.${extension}`;
}

/**
 * Заголовки клиента для запроса к API. Без них API видит все запросы с адреса
 * контейнера веба, и общий на весь портал лимит запросов отвечает 429.
 */
export function clientHeaders(source: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of ["x-forwarded-for", "x-real-ip"]) {
    const value = source.get(name);
    if (value) result[name] = value;
  }
  return result;
}
