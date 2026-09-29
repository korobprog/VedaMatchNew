import type {
  LineageId,
  SpiritualStage,
  VedabaseBookManifest,
} from "@vedamatch/shared";

/**
 * Полка Библиотеки (VED-662) — чистая часть: фильтр нижней панели, «Продолжить чтение» и закладки из
 * локальной базы читалки. Экран — `components/vedabase/shelf/`.
 */

export interface ShelfFilters {
  /** Пусто — все ступени. */
  stages: readonly SpiritualStage[];
  /** Пусто — все линии. */
  lineages: readonly LineageId[];
}

function matches<T>(marked: readonly T[], chosen: readonly T[]): boolean {
  return (
    marked.length === 0 ||
    chosen.length === 0 ||
    marked.some((item) => chosen.includes(item))
  );
}

/**
 * Книги под выбор нижней панели. Разметку «для кого» и линий задаёт админка
 * Библиотеки (VED-662, часть 3); неразмеченные видны при любом выборе.
 */
export function filterShelf<
  B extends Pick<VedabaseBookManifest, "audienceStages" | "lineages">,
>(books: readonly B[], filters: ShelfFilters): B[] {
  return books.filter(
    (book) =>
      matches<string>(book.audienceStages ?? [], filters.stages) &&
      matches<string>(book.lineages ?? [], filters.lineages),
  );
}

/** Поиск по полке: по названию и автору, без регистра. */
export function searchShelf<
  B extends Pick<VedabaseBookManifest, "title" | "author">,
>(books: readonly B[], query: string): B[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  if (!needle) return [...books];
  return books.filter((book) =>
    `${book.title} ${book.author ?? ""}`
      .toLocaleLowerCase("ru-RU")
      .includes(needle),
  );
}

/** Адрес главы в читалке. */
export function chapterHref(bookSlug: string, chapterSlug: string): string {
  return `/vedabase/books/${encodeURIComponent(bookSlug)}/${encodeURIComponent(chapterSlug)}`;
}

/** Первая глава книги по порядку; `null` — глав нет. */
export function firstChapterSlug(
  book: Pick<VedabaseBookManifest, "chapters">,
): string | null {
  return [...book.chapters].sort((a, b) => a.order - b.order)[0]?.slug ?? null;
}

export interface ShelfProgress {
  bookSlug: string;
  chapterSlug: string;
  /** 0…100. */
  percentage: number;
  lastReadAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function locatorOf(
  value: unknown,
): { bookSlug: string; chapterSlug: string } | null {
  if (!isRecord(value)) return null;
  const { bookSlug, chapterSlug } = value;
  return typeof bookSlug === "string" && typeof chapterSlug === "string"
    ? { bookSlug, chapterSlug }
    : null;
}

/**
 * Что читали — по книге, свежее сверху: «История» в настройках полки и
 * «Продолжить чтение» (VED-677). Записи читалки (`progress` в IndexedDB)
 * разбираются осторожно: битая строка пропускается.
 */
export function recentProgress(
  records: readonly { payload: unknown }[],
): ShelfProgress[] {
  const items: ShelfProgress[] = [];
  for (const { payload } of records) {
    if (!isRecord(payload)) continue;
    const locator = locatorOf(payload.locator);
    const { percentage, lastReadAt } = payload;
    if (
      !locator ||
      typeof percentage !== "number" ||
      typeof lastReadAt !== "string"
    )
      continue;
    items.push({
      ...locator,
      percentage: Math.round(Math.min(100, Math.max(0, percentage))),
      lastReadAt,
    });
  }
  return items.sort((left, right) =>
    right.lastReadAt.localeCompare(left.lastReadAt),
  );
}

/** Что читали последним — для «Продолжить чтение». */
export function latestProgress(
  records: readonly { payload: unknown }[],
): ShelfProgress | null {
  return recentProgress(records)[0] ?? null;
}

export interface ShelfBookmark {
  id: string;
  bookSlug: string;
  bookTitle: string;
  chapterSlug: string;
  chapterTitle: string;
  label: string | null;
}

/**
 * Живые закладки всех книг с названиями книги и главы. Удалённые (у них
 * `deletedAt`) и закладки книг, которых больше нет в каталоге, не видны.
 */
export function shelfBookmarks(
  records: readonly { id: string; payload: unknown }[],
  books: readonly Pick<VedabaseBookManifest, "slug" | "title" | "chapters">[],
): ShelfBookmark[] {
  return records.flatMap(({ id, payload }) => {
    if (!isRecord(payload) || typeof payload.deletedAt === "string") return [];
    const locator = locatorOf(payload.locator);
    const book =
      locator && books.find((item) => item.slug === locator.bookSlug);
    if (!locator || !book) return [];
    const chapter = book.chapters.find(
      (item) => item.slug === locator.chapterSlug,
    );
    return [
      {
        id,
        bookSlug: book.slug,
        bookTitle: book.title,
        chapterSlug: locator.chapterSlug,
        chapterTitle: chapter?.title ?? "Глава",
        label:
          typeof payload.label === "string" && payload.label
            ? payload.label
            : null,
      },
    ];
  });
}

export type ShelfReaderTheme = "light" | "sepia" | "dark";

export interface ShelfReaderPreferences {
  theme: ShelfReaderTheme;
  fontSize: number;
  lineWidth: "narrow" | "medium" | "wide";
}

/** Те же умолчания, что у читалки (`reader-screen.tsx`). */
export const SHELF_READER_DEFAULTS: ShelfReaderPreferences = {
  theme: "sepia",
  fontSize: 18,
  lineWidth: "medium",
};

export const READER_FONT_MIN = 14;
export const READER_FONT_MAX = 26;

/**
 * Настройки читалки, прочитанные с полки: запись `preferences/reader` из
 * IndexedDB, а битая или пустая — умолчания. Проверка та же, что у
 * читалки, иначе полка записала бы то, что читалка отвергнет.
 */
export function readerPreferencesOf(value: unknown): ShelfReaderPreferences {
  if (
    isRecord(value) &&
    (value.theme === "light" ||
      value.theme === "dark" ||
      value.theme === "sepia") &&
    typeof value.fontSize === "number" &&
    Number.isSafeInteger(value.fontSize) &&
    value.fontSize >= READER_FONT_MIN &&
    value.fontSize <= READER_FONT_MAX &&
    (value.lineWidth === "narrow" ||
      value.lineWidth === "medium" ||
      value.lineWidth === "wide")
  ) {
    return {
      theme: value.theme,
      fontSize: value.fontSize,
      lineWidth: value.lineWidth,
    };
  }
  return SHELF_READER_DEFAULTS;
}

/** Шаг размера шрифта с полки: ±2 в пределах читалки. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  return Math.min(
    READER_FONT_MAX,
    Math.max(READER_FONT_MIN, current + direction * 2),
  );
}

/**
 * Отрывок найденного стиха вокруг первого совпавшего слова. Поисковая
 * единица на сервере склеивает санскрит, пословный перевод и комментарий,
 * поэтому целиком её не показать — только окно вокруг находки.
 */
export function searchSnippet(
  text: string,
  query: string,
  radius = 70,
): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLocaleLowerCase("ru-RU");
  const words = query
    .toLocaleLowerCase("ru-RU")
    .split(/\s+/)
    .map((word) => word.slice(0, Math.max(3, word.length - 2)))
    .filter((word) => word.length >= 3);
  const hits = words
    .map((word) => lower.indexOf(word))
    .filter((index) => index >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + radius * 2);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

/**
 * Подпись под «Библиотекой» (VED-676): преданному — архив ведической
 * литературы, остальным ступеням — книги для саморазвития. Без
 * самоидентификации — как преданному: портал для преданных.
 */
export function shelfSubtitle(stage: SpiritualStage | null): string {
  return stage === null || stage === "devotee"
    ? "Архив ведической литературы — онлайн и офлайн"
    : "Архив книг для саморазвития";
}

/**
 * Заголовок полки (VED-682): если все видимые книги — Шрилы Прабхупады,
 * так и сказать; иначе просто «Книги».
 */
export function shelfHeading(
  books: readonly Pick<VedabaseBookManifest, "author">[],
): string {
  return books.length > 0 &&
    books.every((book) => /прабхупад/i.test(book.author ?? ""))
    ? "Книги Шрилы А. Ч. Бхактиведанты Свами Прабхупады"
    : "Книги";
}

/** Кнопки нижней панели полки (VED-677). */
export const DOCK_ITEMS = [
  "bookmarks",
  "search",
  "filters",
  "settings",
] as const;
export type DockItem = (typeof DOCK_ITEMS)[number];

/** Ключ порядка кнопок в `localStorage` — удобство одного браузера. */
export const DOCK_ORDER_KEY = "vm-library-dock";

/**
 * Сохранённый порядок кнопок: известные — в сохранённом порядке, новые и
 * потерянные — дописываются в конец, мусор отбрасывается.
 */
export function parseDockOrder(raw: string | null): DockItem[] {
  let saved: unknown = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const known = Array.isArray(saved)
    ? saved.filter(
        (item, index): item is DockItem =>
          (DOCK_ITEMS as readonly unknown[]).includes(item) &&
          saved.indexOf(item) === index,
      )
    : [];
  return [...known, ...DOCK_ITEMS.filter((item) => !known.includes(item))];
}

/** Сдвинуть кнопку на шаг влево (−1) или вправо (+1). */
export function moveDockItem(
  order: readonly DockItem[],
  item: DockItem,
  delta: -1 | 1,
): DockItem[] {
  const from = order.indexOf(item);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
