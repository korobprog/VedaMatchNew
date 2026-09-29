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
  BookMarked,
  BookOpen,
  Bookmark,
  CircleHelp,
  GitBranch,
  HeartHandshake,
  Menu,
  Search,
  UserRound,
} from "lucide-react";
import { openVedabaseDb } from "@/lib/vedabase/local-db";
import { searchVedabase } from "@/lib/vedabase-client-api";
import {
  chapterHref,
  filterShelf,
  firstChapterSlug,
  latestProgress,
  readerPreferencesOf,
  searchShelf,
  searchSnippet,
  shelfBookmarks,
  stepFontSize,
  type ShelfBookmark,
  type ShelfFilters,
  type ShelfProgress,
  type ShelfReaderPreferences,
  type ShelfReaderTheme,
} from "@/lib/vedabase/shelf";
import { cn } from "@/lib/utils";
import { ShelfSheet } from "./shelf-sheet";

type Sheet = "menu" | "stage" | "lineage" | "bookmarks" | "search" | null;

// Образцы красятся палитрой самой читалки (`data-reader-theme` в globals.css).
const THEMES: Array<{ value: ShelfReaderTheme; label: string }> = [
  { value: "light", label: "День" },
  { value: "sepia", label: "Пергамент" },
  { value: "dark", label: "Ночь" },
];

/**
 * Полка Библиотеки (VED-662, часть 1): слева настройки чтения и
 * «Поддержать портал», в центре «Продолжить чтение» и книги, справа
 * закладки, снизу панель «Кто я · Линия · Закладки · Поиск · Викторина».
 *
 * Прогресс, закладки и настройки читалки живут в IndexedDB этого браузера —
 * там же, где их пишет читалка, поэтому полка их читает, а не просит сервер.
 */
export function LibraryShelf({
  userId,
  books,
  initialFilters,
}: {
  userId: string;
  books: VedabaseBookManifest[];
  /** Фильтры материалов портала — с них полка начинает. */
  initialFilters: ShelfFilters;
}) {
  const [filters, setFilters] = useState<ShelfFilters>(initialFilters);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [progress, setProgress] = useState<ShelfProgress | null>(null);
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
        setProgress(latestProgress(progressRows));
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
          <header className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSheet("menu")}
              aria-label="Настройки чтения и поддержка"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-0 lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-3xl font-bold text-text-0">
                Библиотека
              </h1>
              <p className="text-sm text-text-1">
                Книги ачарьев для преданных — читайте онлайн или скачайте в
                дорогу.
              </p>
            </div>
          </header>

          {continueBook && progress && (
            <section
              aria-labelledby="shelf-continue"
              className="flex flex-col gap-4 rounded-3xl border border-gold/40 bg-gold/10 p-5 sm:flex-row sm:items-center"
            >
              <BookCover
                book={continueBook}
                className="w-20 shrink-0 sm:w-24"
              />
              <div className="flex min-w-0 flex-grow flex-col gap-2">
                <span
                  id="shelf-continue"
                  className="text-xs font-bold uppercase tracking-widest text-text-1"
                >
                  Продолжить чтение
                </span>
                <span className="font-display text-xl font-bold text-text-0">
                  {continueBook.title}
                </span>
                {continueChapter && (
                  <span className="text-sm text-text-1">
                    {continueChapter.title}
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-label="Прочитано"
                    aria-valuenow={progress.percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 flex-grow overflow-hidden rounded-full bg-bg-2"
                  >
                    <div
                      className="h-full rounded-full bg-magenta"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-text-1">
                    {progress.percentage}%
                  </span>
                </div>
              </div>
              <Link
                href={chapterHref(progress.bookSlug, progress.chapterSlug)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 font-semibold text-white"
              >
                Читать дальше
              </Link>
            </section>
          )}

          <section
            aria-labelledby="shelf-books"
            className="flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="shelf-books"
                className="font-display text-xl font-bold text-text-0"
              >
                Книги
              </h2>
              <span className="text-sm text-text-2">
                {visible.length === books.length
                  ? `${books.length} в библиотеке`
                  : `${visible.length} из ${books.length} по вашему выбору`}
              </span>
            </div>
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
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 2xl:grid-cols-6">
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
        filters={filters}
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
        open={sheet === "stage"}
        title="Кто я"
        onClose={() => setSheet(null)}
      >
        <StagePicker
          value={filters.stages}
          onChange={(stages) =>
            setFilters((current) => ({ ...current, stages }))
          }
        />
      </ShelfSheet>
      <ShelfSheet
        open={sheet === "lineage"}
        title="Духовная линия"
        onClose={() => setSheet(null)}
      >
        <LineagePicker
          value={filters.lineages}
          onChange={(lineages) =>
            setFilters((current) => ({ ...current, lineages }))
          }
        />
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
}: {
  book: VedabaseBookManifest;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[5/7] flex-col justify-between rounded-l-md rounded-r-xl border-l-[6px] border-gold p-3 shadow-[0_10px_24px_rgba(0,0,0,0.25)]",
        coverTint(book.slug),
        className,
      )}
    >
      <span className="line-clamp-1 text-[10px] uppercase tracking-widest text-text-2">
        {book.author?.split(" ").at(-1) ?? "Библиотека"}
      </span>
      <span className="line-clamp-4 hyphens-auto break-words font-display text-[11px] font-bold leading-snug text-text-0 sm:text-xs">
        {book.title}
      </span>
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
      <span className="text-xs text-text-2">{book.chapters.length} гл.</span>
    </>
  );
  return first ? (
    <Link
      href={chapterHref(book.slug, first)}
      className="group flex flex-col gap-2"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-2 opacity-60">{body}</div>
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

function ShelfDock({
  filters,
  bookmarksCount,
  onOpen,
}: {
  filters: ShelfFilters;
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
      className="fixed inset-x-3 bottom-3 z-30 bg-bg-1 mx-auto flex max-w-xl gap-1 rounded-3xl border border-glass-brd p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] sm:bottom-5"
    >
      <button
        type="button"
        onClick={() => onOpen("stage")}
        className={cn(item, filters.stages.length ? on : idle)}
      >
        <UserRound aria-hidden className="size-5" />
        Кто я
      </button>
      <button
        type="button"
        onClick={() => onOpen("lineage")}
        className={cn(item, filters.lineages.length ? on : idle)}
      >
        <GitBranch aria-hidden className="size-5" />
        Линия
      </button>
      <button
        type="button"
        onClick={() => onOpen("bookmarks")}
        className={cn(item, idle)}
      >
        {bookmarksCount > 0 ? (
          <BookMarked aria-hidden className="size-5" />
        ) : (
          <Bookmark aria-hidden className="size-5" />
        )}
        Закладки
      </button>
      <button
        type="button"
        onClick={() => onOpen("search")}
        className={cn(item, idle)}
      >
        <Search aria-hidden className="size-5" />
        Поиск
      </button>
      <Link href="/motivation/quiz" className={cn(item, idle)}>
        <CircleHelp aria-hidden className="size-5" />
        Викторина
      </Link>
    </nav>
  );
}
