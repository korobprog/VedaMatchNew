"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  lineagesByGroup,
  type LineageId,
  type SpiritualStage,
  type VedabaseBookManifest,
  type VedabaseSearchResult,
} from "@vedamatch/shared";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  BookOpen,
  Bookmark,
  CircleHelp,
  HeartHandshake,
  History,
  Menu,
  Newspaper,
  RotateCcw,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { openVedabaseDb } from "@/lib/vedabase/local-db";
import { searchVedabase } from "@/lib/vedabase-client-api";
import {
  chapterHref,
  filterShelf,
  firstChapterSlug,
  DOCK_ORDER_KEY,
  moveDockItem,
  parseDockOrder,
  readerPreferencesOf,
  recentProgress,
  searchShelf,
  searchSnippet,
  shelfBookmarks,
  shelfHeading,
  shelfSubtitle,
  stepFontSize,
  type DockItem,
  type ShelfBookmark,
  type ShelfFilters,
  type ShelfProgress,
  type ShelfReaderPreferences,
  type ShelfReaderTheme,
} from "@/lib/vedabase/shelf";
import { cn } from "@/lib/utils";
import { ShelfSheet } from "./shelf-sheet";

type Sheet =
  | "menu"
  | "filters"
  | "bookmarks"
  | "search"
  | "settings"
  | "dock"
  | null;

// Образцы красятся палитрой самой читалки (`data-reader-theme` в globals.css).
const THEMES: Array<{ value: ShelfReaderTheme; label: string }> = [
  { value: "light", label: "День" },
  { value: "sepia", label: "Пергамент" },
  { value: "dark", label: "Ночь" },
];

/**
 * Полка Библиотеки (VED-662): слева настройки чтения и «Поддержать портал»,
 * в центре «Продолжить чтение» и книги, справа закладки. Снизу панель
 * (VED-677): «Закладки · Поиск · Фильтры · Настройки», порядок меняется;
 * в «Настройках» — викторина, история, блог-лента и «Поделиться».
 *
 * Прогресс, закладки и настройки читалки живут в IndexedDB этого браузера —
 * там же, где их пишет читалка, поэтому полка их читает, а не просит сервер.
 */
export function LibraryShelf({
  userId,
  books,
  initialFilters,
  stage = null,
}: {
  userId: string;
  books: VedabaseBookManifest[];
  /** Фильтры материалов портала — с них полка начинает. */
  initialFilters: ShelfFilters;
  /** Самоидентификация читателя — от неё подпись под заголовком. */
  stage?: SpiritualStage | null;
}) {
  const [filters, setFilters] = useState<ShelfFilters>(initialFilters);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [recent, setRecent] = useState<ShelfProgress[]>([]);
  const [dockOrder, setDockOrder] = useState<DockItem[]>(() =>
    parseDockOrder(null),
  );
  const [bookmarks, setBookmarks] = useState<ShelfBookmark[]>([]);
  const [prefs, setPrefs] = useState<ShelfReaderPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    // IndexedDB есть только в браузере; без неё полка просто без «своего».
    openVedabaseDb(userId)
      .then(async (db) => {
        const [progressRows, bookmarkRows, prefRow] = await Promise.all([
          db.getAll("progress"),
          db.getAll("bookmarks"),
          db.get("preferences", "reader"),
        ]);
        if (cancelled) return;
        setRecent(recentProgress(progressRows));
        setBookmarks(shelfBookmarks(bookmarkRows, books));
        setPrefs(readerPreferencesOf(prefRow?.value));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, books]);

  async function savePrefs(next: ShelfReaderPreferences) {
    setPrefs(next);
    try {
      const db = await openVedabaseDb(userId);
      await db.put("preferences", { key: "reader", value: next });
    } catch {
      // Не сохранилось — читалка откроется со своими настройками.
    }
  }

  useEffect(() => {
    // Порядок кнопок — удобство этого браузера; хранилища может не быть.
    function restore() {
      try {
        setDockOrder(
          parseDockOrder(window.localStorage.getItem(DOCK_ORDER_KEY)),
        );
      } catch {
        // Приватный режим — порядок по умолчанию.
      }
    }
    restore();
  }, []);

  function saveDockOrder(next: DockItem[]) {
    setDockOrder(next);
    try {
      window.localStorage.setItem(DOCK_ORDER_KEY, JSON.stringify(next));
    } catch {
      // Не сохранилось — порядок останется до перезагрузки.
    }
  }

  const progress = recent[0] ?? null;
  const visible = useMemo(() => filterShelf(books, filters), [books, filters]);
  const continueBook = progress
    ? books.find((book) => book.slug === progress.bookSlug)
    : undefined;
  const continueChapter = continueBook?.chapters.find(
    (chapter) => chapter.slug === progress?.chapterSlug,
  );

  const sidePanel = (
    <SidePanel prefs={prefs} onChange={(next) => void savePrefs(next)} />
  );

  return (
    <>
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-36 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside aria-label="Настройки чтения" className="hidden lg:block">
          <div className="glass sticky top-24 rounded-3xl border border-glass-brd p-4">
            {sidePanel}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-8">
          {/* Кнопка настроек — над заголовком, заголовок и счётчик книг —
              одной строкой (VED-676, VED-682). */}
          <header className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSheet("menu")}
              aria-label="Настройки чтения и поддержка"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-0 lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h1 className="font-display text-3xl font-bold text-text-0">
                Библиотека
              </h1>
              <span className="text-sm text-text-2">
                {visible.length === books.length
                  ? `${books.length} в библиотеке`
                  : `${visible.length} из ${books.length} по вашему выбору`}
              </span>
            </div>
            <p className="text-sm text-text-1">{shelfSubtitle(stage)}</p>
          </header>

          {/* «Продолжить чтение» — компактно (VED-676): обложка меньше,
              название вверху рядом с ней, по бокам «Читать дальше» —
              «Начать сначала» и «Закладки». */}
          {continueBook && progress && (
            <section
              aria-label="Продолжить чтение"
              className="flex flex-col gap-3 rounded-3xl border border-gold/40 bg-gold/10 p-4"
            >
              <div className="flex gap-3">
                <BookCover
                  book={continueBook}
                  compact
                  className="w-14 shrink-0"
                />
                <div className="flex min-w-0 flex-grow flex-col gap-1">
                  <span className="font-display text-lg font-bold leading-tight text-text-0">
                    {continueBook.title}
                  </span>
                  {continueChapter && (
                    <span className="truncate text-sm text-text-1">
                      {continueChapter.title}
                    </span>
                  )}
                  <div className="mt-auto flex items-center gap-3">
                    <div
                      role="progressbar"
                      aria-label="Прочитано"
                      aria-valuenow={progress.percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 flex-grow overflow-hidden rounded-full bg-bg-2"
                    >
                      <div
                        className="h-full rounded-full bg-cyan"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-text-1">
                      {progress.percentage}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {firstChapterSlug(continueBook) && (
                  <Link
                    href={chapterHref(
                      continueBook.slug,
                      firstChapterSlug(continueBook)!,
                    )}
                    aria-label="Начать сначала"
                    title="Начать сначала"
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-0 hover:bg-bg-2"
                  >
                    <RotateCcw aria-hidden className="size-5" />
                  </Link>
                )}
                {/* Чёрно-сине-зелёная, а не розовая (VED-676). Белый текст
                    на самом светлом конце — #0F766E — 5.4:1. */}
                <Link
                  href={chapterHref(progress.bookSlug, progress.chapterSlug)}
                  className="inline-flex min-h-11 flex-grow items-center justify-center rounded-xl bg-gradient-to-r from-[#0B1220] via-[#123A5A] to-[#0F766E] px-5 font-semibold text-white"
                >
                  Читать дальше
                </Link>
                <button
                  type="button"
                  onClick={() => setSheet("bookmarks")}
                  aria-label="Закладки"
                  title="Закладки"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-0 hover:bg-bg-2"
                >
                  <Bookmark aria-hidden className="size-5" />
                </button>
              </div>
            </section>
          )}

          <section
            aria-labelledby="shelf-books"
            className="flex flex-col gap-4"
          >
            {/* Одной строкой и на телефоне (VED-682): длинное имя автора
                набрано основным шрифтом, широкий заголовочный — от sm. */}
            <h2
              id="shelf-books"
              className="whitespace-nowrap text-[clamp(11px,3.3vw,20px)] font-bold text-text-0"
            >
              {shelfHeading(visible)}
            </h2>
            {visible.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-glass-brd p-6">
                <p className="text-text-1">Под этот выбор книг пока нет.</p>
                <button
                  type="button"
                  onClick={() => setFilters({ stages: [], lineages: [] })}
                  className="min-h-11 rounded-xl border border-glass-brd px-4 font-semibold text-text-0 hover:bg-bg-2"
                >
                  Показать все книги
                </button>
              </div>
            ) : (
              <ul className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5 sm:gap-x-3 md:grid-cols-6 2xl:grid-cols-8">
                {visible.map((book) => (
                  <li key={book.slug}>
                    <ShelfBook book={book} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside aria-label="Мои закладки" className="hidden xl:block">
          <div className="glass sticky top-24 flex flex-col gap-3 rounded-3xl border border-glass-brd p-4">
            <h2 className="text-sm font-bold text-text-0">Мои закладки</h2>
            <BookmarkList bookmarks={bookmarks.slice(0, 6)} />
            {bookmarks.length > 6 && (
              <button
                type="button"
                onClick={() => setSheet("bookmarks")}
                className="min-h-11 rounded-xl text-sm font-semibold text-magenta hover:bg-bg-2"
              >
                Все закладки · {bookmarks.length}
              </button>
            )}
          </div>
        </aside>
      </div>

      <ShelfDock
        order={dockOrder}
        filtersActive={filters.stages.length + filters.lineages.length > 0}
        bookmarksCount={bookmarks.length}
        onOpen={setSheet}
      />

      <ShelfSheet
        open={sheet === "menu"}
        title="Чтение"
        onClose={() => setSheet(null)}
      >
        {sidePanel}
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "filters"}
        title="Фильтры"
        onClose={() => setSheet(null)}
      >
        <div className="flex flex-col gap-6">
          <section aria-label="Кто я" className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-text-0">Кто я</h3>
            <StagePicker
              value={filters.stages}
              onChange={(stages) =>
                setFilters((current) => ({ ...current, stages }))
              }
            />
          </section>
          <section aria-label="Духовная линия" className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-text-0">Духовная линия</h3>
            <LineagePicker
              value={filters.lineages}
              onChange={(lineages) =>
                setFilters((current) => ({ ...current, lineages }))
              }
            />
          </section>
        </div>
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "settings"}
        title="Настройки"
        side
        onClose={() => setSheet(null)}
      >
        {sheet === "settings" && (
          <ShelfSettings
            books={books}
            recent={recent}
            onReorder={() => setSheet("dock")}
          />
        )}
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "dock"}
        title="Расположение кнопок"
        onClose={() => setSheet(null)}
      >
        <DockOrderEditor order={dockOrder} onChange={saveDockOrder} />
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "bookmarks"}
        title="Закладки"
        onClose={() => setSheet(null)}
      >
        <BookmarkList bookmarks={bookmarks} />
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "search"}
        title="Поиск"
        onClose={() => setSheet(null)}
      >
        <ShelfSearch books={books} />
      </ShelfSheet>
    </>
  );
}

// Тёплые переплёты по очереди — полка не сливается в одну плашку.
const COVER_TINTS = ["bg-gold/20", "bg-magenta/15", "bg-gold/10"];

function coverTint(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_TINTS[hash % COVER_TINTS.length];
}

function BookCover({
  book,
  className,
  compact = false,
}: {
  book: VedabaseBookManifest;
  className?: string;
  /** Маленькая обложка «Продолжить чтение»: без подписей внутри. */
  compact?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[5/7] flex-col justify-end gap-1 rounded-l-md rounded-r-lg border-l-4 border-gold p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.22)] sm:p-2",
        coverTint(book.slug),
        className,
      )}
    >
      {!compact && (
        <>
          {/* Автора на обложке нет (VED-682): он уже в заголовке полки. */}
          <span className="line-clamp-4 hyphens-auto break-words font-display text-[9px] font-bold leading-snug text-text-0 sm:text-[11px]">
            {book.title}
          </span>
          <span className="self-end font-mono text-[9px] text-text-2 sm:text-[10px]">
            {book.chapters.length} гл.
          </span>
        </>
      )}
    </div>
  );
}

function ShelfBook({ book }: { book: VedabaseBookManifest }) {
  const first = firstChapterSlug(book);
  const body = (
    <>
      <BookCover
        book={book}
        className="transition-transform group-hover:-translate-y-1"
      />
      <span className="sr-only">{book.title}</span>
    </>
  );
  return first ? (
    <Link href={chapterHref(book.slug, first)} className="group block">
      {body}
    </Link>
  ) : (
    <div className="opacity-60">{body}</div>
  );
}

function SidePanel({
  prefs,
  onChange,
}: {
  prefs: ShelfReaderPreferences | null;
  onChange(next: ShelfReaderPreferences): void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-text-1">
          Тема чтения
        </legend>
        <div className="flex flex-col gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              disabled={!prefs}
              aria-pressed={prefs?.theme === theme.value}
              onClick={() =>
                prefs && onChange({ ...prefs, theme: theme.value })
              }
              data-reader-theme={theme.value}
              className={cn(
                "reader-surface flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold",
                prefs?.theme === theme.value
                  ? "border-magenta ring-2 ring-magenta"
                  : "border-glass-brd",
              )}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-text-1">
          Размер текста
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!prefs}
            onClick={() =>
              prefs &&
              onChange({ ...prefs, fontSize: stepFontSize(prefs.fontSize, -1) })
            }
            aria-label="Мельче"
            className="flex size-11 items-center justify-center rounded-xl border border-glass-brd text-sm text-text-0 hover:bg-bg-2"
          >
            A−
          </button>
          <span className="flex-grow text-center font-mono text-sm text-text-1">
            {prefs?.fontSize ?? "—"}
          </span>
          <button
            type="button"
            disabled={!prefs}
            onClick={() =>
              prefs &&
              onChange({ ...prefs, fontSize: stepFontSize(prefs.fontSize, 1) })
            }
            aria-label="Крупнее"
            className="flex size-11 items-center justify-center rounded-xl border border-glass-brd text-lg text-text-0 hover:bg-bg-2"
          >
            A+
          </button>
        </div>
        <span className="text-xs text-text-2">Применится в читалке.</span>
      </div>
      <Link
        href="/donate"
        className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-3 text-sm font-semibold text-white"
      >
        <HeartHandshake aria-hidden className="size-4" />
        Поддержать портал
      </Link>
    </div>
  );
}

function BookmarkList({ bookmarks }: { bookmarks: ShelfBookmark[] }) {
  if (bookmarks.length === 0) {
    return (
      <p className="text-sm text-text-2">
        Закладок пока нет. В читалке — значок закладки у стиха.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {bookmarks.map((mark) => (
        <li key={mark.id}>
          <Link
            href={chapterHref(mark.bookSlug, mark.chapterSlug)}
            className="flex flex-col gap-0.5 rounded-xl bg-bg-2 px-3 py-2.5 hover:text-magenta"
          >
            <span className="text-xs text-text-2">{mark.bookTitle}</span>
            <span className="text-sm text-text-0">
              {mark.label ?? mark.chapterTitle}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-semibold",
        active
          ? "border-magenta bg-magenta/10 text-text-0"
          : "border-glass-brd text-text-1 hover:text-text-0",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function StagePicker({
  value,
  onChange,
}: {
  value: readonly SpiritualStage[];
  onChange(next: SpiritualStage[]): void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-1">
        Какие книги показывать. Книги для всех видны при любом выборе.
      </p>
      <div className="flex flex-wrap gap-2">
        <Chip active={value.length === 0} onClick={() => onChange([])}>
          Все
        </Chip>
        {AUDIENCE_STAGES.map((stage) => (
          <Chip
            key={stage}
            active={value.includes(stage)}
            onClick={() => onChange(toggle(value, stage))}
          >
            {AUDIENCE_STAGE_LABELS[stage]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function LineagePicker({
  value,
  onChange,
}: {
  value: readonly LineageId[];
  onChange(next: LineageId[]): void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-1">
        Книги вашей линии. Книги без отметки линии видны всем.
      </p>
      <Chip active={value.length === 0} onClick={() => onChange([])}>
        Все линии
      </Chip>
      {lineagesByGroup().map((group) => (
        <div key={group.group} className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-text-2">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {group.items.map((lineage) => (
              <Chip
                key={lineage.id}
                active={value.includes(lineage.id)}
                onClick={() => onChange(toggle(value, lineage.id))}
              >
                {lineage.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShelfSearch({ books }: { books: VedabaseBookManifest[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VedabaseSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const titles = searchShelf(books, query);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setPending(true);
    setError(null);
    try {
      setResults(await searchVedabase(query.trim()));
    } catch {
      setError("Поиск не удался. Проверьте связь и попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={run} className="flex gap-2">
        <label className="flex-grow">
          <span className="sr-only">Слово или фраза</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResults(null);
            }}
            autoFocus
            placeholder="Слово или фраза во всех книгах"
            className="min-h-11 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 text-sm text-text-0"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !query.trim()}
          className="min-h-11 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Ищем…" : "Найти"}
        </button>
      </form>
      {query.trim() && titles.length > 0 && titles.length < books.length && (
        <ul aria-label="Книги по названию" className="flex flex-wrap gap-2">
          {titles.map((book) => {
            const first = firstChapterSlug(book);
            return first ? (
              <li key={book.slug}>
                <Link
                  href={chapterHref(book.slug, first)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-glass-brd px-4 text-sm text-text-0 hover:border-magenta"
                >
                  <BookOpen aria-hidden className="size-4" />
                  {book.title}
                </Link>
              </li>
            ) : null;
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      )}
      {results && results.length === 0 && (
        <p className="text-sm text-text-2">В текстах книг ничего не нашлось.</p>
      )}
      {results && results.length > 0 && (
        <ul aria-label="Найдено в текстах" className="flex flex-col gap-2">
          {results.map((result) => {
            const book = books.find((item) => item.slug === result.bookSlug);
            return (
              <li key={`${result.bookSlug}/${result.locator.unitId}`}>
                <Link
                  href={chapterHref(result.bookSlug, result.chapterSlug)}
                  className="flex flex-col gap-1 rounded-xl bg-bg-2 px-3 py-2.5 hover:text-magenta"
                >
                  <span className="text-xs text-text-2">
                    {book?.title ?? result.bookSlug} · {result.title}
                  </span>
                  <span className="text-sm leading-relaxed text-text-0">
                    {searchSnippet(result.text, query)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const DOCK_LABELS: Record<DockItem, string> = {
  bookmarks: "Закладки",
  search: "Поиск",
  filters: "Фильтры",
  settings: "Настройки",
};

function DockIcon({ item, filled }: { item: DockItem; filled?: boolean }) {
  const className = "size-5";
  if (item === "bookmarks")
    return filled ? (
      <BookMarked aria-hidden className={className} />
    ) : (
      <Bookmark aria-hidden className={className} />
    );
  if (item === "search") return <Search aria-hidden className={className} />;
  if (item === "filters")
    return <SlidersHorizontal aria-hidden className={className} />;
  return <Settings aria-hidden className={className} />;
}

/**
 * Нижняя панель полки (VED-677): «Кто я» и «Линия» собраны в одни
 * «Фильтры», «Викторина» ушла в «Настройки». Порядок кнопок — свой у
 * каждого браузера, меняется в «Настройках».
 */
function ShelfDock({
  order,
  filtersActive,
  bookmarksCount,
  onOpen,
}: {
  order: readonly DockItem[];
  filtersActive: boolean;
  bookmarksCount: number;
  onOpen(sheet: Sheet): void;
}) {
  const item =
    "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-semibold transition-colors sm:min-w-24 sm:text-xs";
  const idle = "text-text-1 hover:bg-bg-2 hover:text-text-0";
  const on = "bg-magenta/10 text-text-0";
  return (
    <nav
      aria-label="Панель библиотеки"
      className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-md gap-1 rounded-3xl border border-glass-brd bg-bg-1 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] sm:bottom-5"
    >
      {order.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onOpen(key)}
          aria-pressed={key === "filters" ? filtersActive : undefined}
          className={cn(item, key === "filters" && filtersActive ? on : idle)}
        >
          <DockIcon
            item={key}
            filled={key === "bookmarks" && bookmarksCount > 0}
          />
          {DOCK_LABELS[key]}
        </button>
      ))}
    </nav>
  );
}

function DockOrderEditor({
  order,
  onChange,
}: {
  order: readonly DockItem[];
  onChange(next: DockItem[]): void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {order.map((key, index) => (
        <li
          key={key}
          className="flex items-center gap-3 rounded-xl bg-bg-2 px-3 py-1.5"
        >
          <DockIcon item={key} />
          <span className="flex-grow text-sm font-semibold text-text-0">
            {DOCK_LABELS[key]}
          </span>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onChange(moveDockItem(order, key, -1))}
            aria-label={`${DOCK_LABELS[key]} — левее`}
            className="flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            disabled={index === order.length - 1}
            onClick={() => onChange(moveDockItem(order, key, 1))}
            aria-label={`${DOCK_LABELS[key]} — правее`}
            className="flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
          >
            <ArrowDown aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * «Настройки» полки — колонкой справа (VED-677): викторина, история
 * чтения, расположение кнопок, пост в блог-ленту и «Поделиться» тем, что
 * скопировано из книги.
 */
function ShelfSettings({
  books,
  recent,
  onReorder,
}: {
  books: VedabaseBookManifest[];
  recent: ShelfProgress[];
  onReorder(): void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const row =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-text-0 hover:bg-bg-2";

  async function share() {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Браузер не дал прочитать буфер — поделимся ссылкой на Библиотеку.
    }
    const url = `${window.location.origin}/vedabase`;
    const data = text
      ? { text: `${text}\n\n${url}` }
      : { title: "Библиотека VedaMatch", url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(text ? `${text}\n\n${url}` : url);
      setStatus("Скопировано — вставьте в сообщение.");
    } catch {
      // Отмена в окне «Поделиться» — не ошибка.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Действия" className="flex flex-col gap-1">
        <Link href="/motivation/quiz" className={row}>
          <CircleHelp aria-hidden className="size-5 text-text-1" />
          Викторина
        </Link>
        <button type="button" onClick={onReorder} className={row}>
          <SlidersHorizontal aria-hidden className="size-5 text-text-1" />
          Изменить расположение кнопок
        </button>
        <Link href="/blog?new=1" className={row}>
          <Newspaper aria-hidden className="size-5 text-text-1" />
          Отправить в блог-ленту
        </Link>
        <button type="button" onClick={() => void share()} className={row}>
          <Share2 aria-hidden className="size-5 text-text-1" />
          Поделиться
        </button>
        {status && (
          <p role="status" className="px-3 text-xs text-text-1">
            {status}
          </p>
        )}
      </nav>
      <section aria-labelledby="shelf-history" className="flex flex-col gap-2">
        <h3
          id="shelf-history"
          className="flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-widest text-text-1"
        >
          <History aria-hidden className="size-4" />
          История
        </h3>
        {recent.length === 0 ? (
          <p className="px-3 text-sm text-text-2">
            Здесь появятся книги, которые вы читали.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {recent.map((item) => {
              const book = books.find((entry) => entry.slug === item.bookSlug);
              if (!book) return null;
              const chapter = book.chapters.find(
                (entry) => entry.slug === item.chapterSlug,
              );
              return (
                <li key={item.bookSlug}>
                  <Link
                    href={chapterHref(item.bookSlug, item.chapterSlug)}
                    className="flex flex-col gap-0.5 rounded-xl px-3 py-2 hover:bg-bg-2"
                  >
                    <span className="text-sm font-semibold text-text-0">
                      {book.title}
                    </span>
                    <span className="text-xs text-text-2">
                      {chapter?.title ?? "Глава"} · {item.percentage}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
