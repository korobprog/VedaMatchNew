"use client";

import { useMemo, useState } from "react";
import { BookCard } from "./book-card";
import { DownloadAllPanel } from "./download-all-panel";
import { useVedabase } from "./vedabase-provider";
import { OfflineIndicator } from "./offline-indicator";

type LibraryFilter =
  | "all"
  | "downloaded"
  | "not-downloaded"
  | "started"
  | "completed";

const filters: Array<{ value: LibraryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "downloaded", label: "Скачанные" },
  { value: "not-downloaded", label: "Не скачанные" },
  { value: "started", label: "Начатые" },
  { value: "completed", label: "Завершённые" },
];

export function LibraryScreen() {
  const {
    library,
    snapshot,
    actionError,
    downloadBook,
    pauseBook,
    removeBook,
    resumeBook,
  } = useVedabase();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const visibleBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return library.books.filter((book) => {
      if (!book.title.toLocaleLowerCase("ru-RU").includes(normalizedQuery)) {
        return false;
      }
      const status = snapshot.downloads[book.slug]?.status;
      if (filter === "downloaded" || filter === "completed") {
        return status === "complete";
      }
      if (filter === "not-downloaded") {
        return status === undefined || status === "idle" || status === "error";
      }
      if (filter === "started") {
        return status === "downloading" || status === "paused";
      }
      return true;
    });
  }, [filter, library.books, query, snapshot.downloads]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Union Vedabase
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Читайте сохранённые книги даже без подключения к сети.
          </p>
        </div>
        <OfflineIndicator />
      </div>

      <DownloadAllPanel />

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-amber-600 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap gap-2" aria-label="Фильтры библиотеки">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                filter === item.value
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {actionError}
        </p>
      )}

      {visibleBooks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Книги не найдены
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleBooks.map((book) => (
            <BookCard
              key={book.slug}
              book={book}
              download={snapshot.downloads[book.slug]}
              onDownload={() => downloadBook(book.slug)}
              onPause={() => pauseBook(book.slug)}
              onRemove={() => removeBook(book.slug)}
              onResume={() => resumeBook(book.slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
