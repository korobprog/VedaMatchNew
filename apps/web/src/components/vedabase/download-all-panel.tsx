"use client";

import { useVedabase } from "./vedabase-provider";

export function DownloadAllPanel() {
  const { library, snapshot, downloadLibrary } = useVedabase();
  const totalBytes = library.books.reduce((sum, book) => sum + book.sizeBytes, 0);
  const progress = snapshot.libraryDownload;
  const completedBooks =
    progress?.completedBooks ??
    library.books.filter(
      (book) => snapshot.downloads[book.slug]?.status === "complete",
    ).length;
  const totalBooks = progress?.totalBooks ?? library.books.length;
  const percentage = totalBooks === 0 ? 0 : (completedBooks / totalBooks) * 100;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Офлайн-библиотека
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Всего: {formatBytes(totalBytes)}
          </p>
        </div>
        <button
          type="button"
          onClick={downloadLibrary}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
        >
          Скачать всю библиотеку
        </button>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <span>
            {completedBooks} из {totalBooks} книг
          </span>
          <span>{Math.round(percentage)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-600 transition-[width]"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </section>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024)} КБ`;
  }
  return `${formatNumber(bytes / (1024 * 1024))} МБ`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}
