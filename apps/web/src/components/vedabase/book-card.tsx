"use client";

import type { VedabaseBookManifest } from "@vedamatch/shared";
import type { VedabaseDownloadState } from "@/lib/vedabase/local-db";
import { formatBytes } from "./download-all-panel";

export function BookCard({
  book,
  download,
  onDownload,
  onPause,
  onRemove,
  onResume,
}: {
  book: VedabaseBookManifest;
  download?: VedabaseDownloadState;
  onDownload(): void;
  onPause(): void;
  onRemove(): void;
  onResume(): void;
}) {
  const firstChapter = [...book.chapters].sort((a, b) => a.order - b.order)[0];
  const percentage = download?.totalBytes
    ? Math.min(100, Math.round((download.downloadedBytes / download.totalBytes) * 100))
    : 0;

  return (
    <article
      data-testid={`book-card-${book.slug}`}
      className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex-1">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl dark:bg-amber-950">
          📖
        </div>
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          {book.title}
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {book.author ?? "Vedabase"} · {formatBytes(book.sizeBytes)}
        </p>
        <p className="mt-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {downloadLabel(download, percentage)}
        </p>
        {download && download.status !== "complete" && download.totalBytes > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-amber-600"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
        {download?.error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            {download.error}
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {download?.status === "complete" && firstChapter ? (
          <>
            <a
              href={`/vedabase/books/${encodeURIComponent(book.slug)}/${encodeURIComponent(firstChapter.slug)}`}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Читать
            </a>
            <button type="button" onClick={onRemove} className={secondaryButtonClass}>
              Удалить с устройства
            </button>
          </>
        ) : download?.status === "paused" ? (
          <button type="button" onClick={onResume} className={primaryButtonClass}>
            Продолжить
          </button>
        ) : download?.status === "downloading" ? (
          <button type="button" onClick={onPause} className={secondaryButtonClass}>
            Пауза
          </button>
        ) : (
          <button type="button" onClick={onDownload} className={primaryButtonClass}>
            Скачать
          </button>
        )}
      </div>
    </article>
  );
}

function downloadLabel(
  download: VedabaseDownloadState | undefined,
  percentage: number,
): string {
  if (!download) return "Не скачана";
  if (download.status === "complete") return "Доступна офлайн";
  if (download.status === "paused") return `Пауза · ${percentage}%`;
  if (download.status === "downloading") return `Скачивание · ${percentage}%`;
  if (download.status === "error") return "Ошибка загрузки";
  return "Не скачана";
}

const primaryButtonClass =
  "rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700";
const secondaryButtonClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
