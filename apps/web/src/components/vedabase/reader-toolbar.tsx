"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  List,
  NotebookPen,
  Search,
  Type,
} from "lucide-react";

export type ReaderTheme = "light" | "dark" | "sepia";
export type ReaderLineWidth = "narrow" | "medium" | "wide";

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSize: number;
  lineWidth: ReaderLineWidth;
}

const THEMES: Array<{ value: ReaderTheme; label: string }> = [
  { value: "light", label: "День" },
  { value: "sepia", label: "Пергамент" },
  { value: "dark", label: "Ночь" },
];

const icon =
  "reader-hover flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors";

/**
 * Верхняя панель читалки (VED-662): назад, название книги и главы, поиск,
 * оформление и закладка. Содержание и заметки на узком экране открываются
 * отсюда же, на широком они стоят колонками по бокам.
 */
export function ReaderToolbar({
  bookTitle,
  chapterTitle,
  back,
  preferences,
  bookmarked,
  onPreferencesChange,
  onToggleBookmark,
  onOpenSearch,
  onOpenContents,
  onOpenNotes,
}: {
  bookTitle: string;
  chapterTitle: string;
  back?: { href: string; label: string };
  preferences: ReaderPreferences;
  bookmarked: boolean;
  onPreferencesChange(preferences: ReaderPreferences): void;
  onToggleBookmark(): void;
  onOpenSearch(): void;
  onOpenContents(): void;
  onOpenNotes(): void;
}) {
  const fontSize = (amount: number) =>
    onPreferencesChange({
      ...preferences,
      fontSize: Math.min(26, Math.max(14, preferences.fontSize + amount)),
    });

  return (
    <div className="reader-surface sticky top-[var(--reader-top,0px)] z-20 border-b">
      <div className="mx-auto flex max-w-[1500px] items-center gap-1 px-2 py-2 sm:gap-2 sm:px-4">
        {back && (
          <Link href={back.href} aria-label={back.label} className={icon}>
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
        )}
        <button
          type="button"
          onClick={onOpenContents}
          aria-label="Содержание"
          className={`${icon} lg:hidden`}
        >
          <List aria-hidden className="size-5" />
        </button>
        <div className="flex min-w-0 flex-grow flex-col px-1">
          <span className="reader-muted truncate text-xs">{bookTitle}</span>
          <span className="truncate text-sm font-semibold">{chapterTitle}</span>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Поиск по скачанным книгам"
          className={icon}
        >
          <Search aria-hidden className="size-5" />
        </button>
        <details className="relative">
          <summary
            aria-label="Оформление"
            className={`${icon} cursor-pointer list-none`}
          >
            <Type aria-hidden className="size-5" />
          </summary>
          <div className="reader-surface absolute right-0 top-12 z-30 flex w-72 flex-col gap-4 rounded-2xl border p-4 shadow-2xl">
            <fieldset className="flex flex-col gap-2">
              <legend className="reader-muted mb-2 text-xs font-semibold uppercase tracking-wide">
                Тема
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    data-reader-theme={theme.value}
                    aria-pressed={preferences.theme === theme.value}
                    onClick={() =>
                      onPreferencesChange({
                        ...preferences,
                        theme: theme.value,
                      })
                    }
                    className="reader-surface min-h-11 rounded-xl border text-xs font-semibold aria-pressed:ring-2 aria-pressed:ring-magenta"
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Уменьшить шрифт"
                onClick={() => fontSize(-1)}
                className="reader-bordered reader-hover flex size-11 items-center justify-center rounded-xl border"
              >
                A−
              </button>
              <span
                className="flex-grow text-center font-mono text-sm"
                aria-label="Размер шрифта"
              >
                {preferences.fontSize}px
              </span>
              <button
                type="button"
                aria-label="Увеличить шрифт"
                onClick={() => fontSize(1)}
                className="reader-bordered reader-hover flex size-11 items-center justify-center rounded-xl border text-lg"
              >
                A+
              </button>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Ширина строки
              <select
                aria-label="Ширина строки"
                value={preferences.lineWidth}
                onChange={(event) =>
                  onPreferencesChange({
                    ...preferences,
                    lineWidth: event.target.value as ReaderLineWidth,
                  })
                }
                className="reader-field min-h-11 rounded-lg border px-2"
              >
                <option value="narrow">Узкая</option>
                <option value="medium">Средняя</option>
                <option value="wide">Широкая</option>
              </select>
            </label>
          </div>
        </details>
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={bookmarked ? "Убрать закладку" : "Добавить закладку"}
          aria-pressed={bookmarked}
          className={`${icon} ${bookmarked ? "reader-accent" : ""}`}
        >
          {bookmarked ? (
            <BookmarkCheck aria-hidden className="size-5" />
          ) : (
            <Bookmark aria-hidden className="size-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenNotes}
          aria-label="Заметки и закладки"
          className={`${icon} xl:hidden`}
        >
          <NotebookPen aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Нижняя панель: листание по главам и где ты в книге. Стрелки клавиатуры
 * тоже листают — кроме полей ввода и пока в тексте что-то выделено.
 */
export function ChapterPager({
  index,
  total,
  onPrevious,
  onNext,
}: {
  /** Номер открытой главы с нуля; −1 — глава не нашлась в оглавлении. */
  index: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const percent =
    total > 0 && index >= 0 ? Math.round(((index + 1) / total) * 100) : 0;
  const button =
    "reader-hover min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-40";
  return (
    <nav
      aria-label="Листание"
      className="reader-surface sticky bottom-0 z-20 border-t"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2 sm:gap-4 sm:px-4">
        <button
          type="button"
          disabled={!onPrevious}
          onClick={onPrevious}
          aria-label="Предыдущая глава"
          className={button}
        >
          ←<span className="hidden sm:inline"> Назад</span>
        </button>
        <div className="flex flex-grow flex-col items-center gap-1.5">
          <div
            role="progressbar"
            aria-label="Прочитано в книге"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="reader-subtle h-1 w-full overflow-hidden rounded-full"
          >
            <div
              className="h-full rounded-full bg-magenta"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="reader-muted font-mono text-xs">
            {index >= 0 ? `Глава ${index + 1} из ${total}` : `${total} глав`}
          </span>
        </div>
        <button
          type="button"
          disabled={!onNext}
          onClick={onNext}
          aria-label="Следующая глава"
          className={button}
        >
          <span className="hidden sm:inline">Дальше </span>→
        </button>
      </div>
    </nav>
  );
}
