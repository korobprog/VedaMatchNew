/**
 * Чистая часть маршрута `/m/<slug>/story` — вынесена, чтобы проверять тестом
 * без сети и без Next.
 */

/**
 * Имя файла в «Загрузках» и в шторке «Поделиться»: «vedamatch-<slug>.jpg»
 * узнаётся, а случайный ключ хранилища — нет. Расширение — по фактическому
 * типу: файл `.jpg` с PNG внутри часть приложений не берёт.
 */
export function storyFileName(
  slug: string,
  contentType: string | null,
  quality: StoryQuality = "light",
): string {
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const extension =
    type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const safe = slug.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  // Три качества одной картинки в «Загрузках» не должны называться одинаково:
  // телефон допишет «(1)», и не понять, какой файл какой.
  return `vedamatch-${safe || "card"}${QUALITY_SUFFIX[quality]}.${extension}`;
}

/**
 * Качество файла (VED-156, «3 кнопки сохранить изображение в разном
 * качестве»). Белый список тот же, что у API (`saved-image-quality.ts`):
 * чужое значение сюда не проходит и в API не уходит.
 */
export const STORY_QUALITIES = ["light", "standard", "max"] as const;
export type StoryQuality = (typeof STORY_QUALITIES)[number];

const QUALITY_SUFFIX: Record<StoryQuality, string> = {
  light: "",
  standard: "-hq",
  max: "-max",
};

/** `?q=` из адреса → качество; пусто или мусор — лёгкое, как было. */
export function storyQuality(raw: string | null): StoryQuality {
  return (STORY_QUALITIES as readonly string[]).includes(raw ?? "")
    ? (raw as StoryQuality)
    : "light";
}

/** Адрес файла у API: лёгкое — без параметра, чтобы ключ кэша не менялся. */
export function savedImageApiPath(slug: string, quality: StoryQuality): string {
  const base = `/motivation/posts/${encodeURIComponent(slug)}/saved-image`;
  return quality === "light" ? base : `${base}?q=${quality}`;
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
