import type {
  LineageId,
  SpiritualStage,
  VedabaseBookManifest,
} from "@vedamatch/shared";

/**
 * Полка Библиотеки (VED-662) — чистая часть: разметка книг по ступеням и
 * линиям, фильтр нижней панели, «Продолжить чтение» и закладки из
 * локальной базы читалки. Экран — `components/vedabase/shelf/`.
 */

/**
 * Для кого книга — редакционная разметка каталога, пока её нельзя задать
 * в админке (следующая часть VED-662). Пусто — для всех: такую книгу
 * фильтр «Кто я» не прячет, как и материалы Образования без разметки.
 */
export const VEDABASE_BOOK_STAGES: Readonly<Record<string, SpiritualStage[]>> =
  {
    "bhagavad-gita": [],
    isopanishad: [],
    "prabhupada-lilamrita": [],
    "srimad-bhagavatam": ["practitioner", "devotee"],
    "chaitanya-charitamrita": ["devotee"],
    "nectar-devotion": ["practitioner", "devotee"],
    "nectar-instructions": ["practitioner", "devotee"],
    "prayers-kunti": ["practitioner", "devotee"],
    "raja-vidya": ["seeker", "practitioner", "yogi"],
    "perfection-yoga": ["seeker", "practitioner", "yogi"],
    "path-perfection": ["seeker", "practitioner", "yogi"],
    "beyond-birth-death": ["seeker", "practitioner", "yogi"],
    "journey-krishna": ["seeker", "practitioner", "yogi"],
    "another-chance": ["seeker", "practitioner", "yogi"],
    "light-bhagavata": ["seeker", "practitioner", "yogi"],
  };

/** Линия книги — по автору; неизвестный автор — для всех линий. */
export function bookLineages(
  book: Pick<VedabaseBookManifest, "author">,
): LineageId[] {
  return /прабхупад/i.test(book.author ?? "") ? ["iskcon"] : [];
}

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

/** Книги под выбор нижней панели; неразмеченные видны при любом выборе. */
export function filterShelf<
  B extends Pick<VedabaseBookManifest, "slug" | "author">,
>(books: readonly B[], filters: ShelfFilters): B[] {
  return books.filter(
    (book) =>
      matches(VEDABASE_BOOK_STAGES[book.slug] ?? [], filters.stages) &&
      matches(bookLineages(book), filters.lineages),
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
 * Что читали последним — для «Продолжить чтение». Записи читалки
 * (`progress` в IndexedDB) разбираются осторожно: битая строка пропускается.
 */
export function latestProgress(
  records: readonly { payload: unknown }[],
): ShelfProgress | null {
  let latest: ShelfProgress | null = null;
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
    if (latest && latest.lastReadAt >= lastReadAt) continue;
    latest = {
      ...locator,
      percentage: Math.round(Math.min(100, Math.max(0, percentage))),
      lastReadAt,
    };
  }
  return latest;
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
  theme: "light",
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
