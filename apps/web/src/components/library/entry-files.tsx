"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import type { LibraryEntryFileDto, LibraryLocale } from "@vedamatch/shared";
import {
  BOOK_FILE_ACCEPT,
  bookFileRejection,
  bookUploadErrorKey,
  formatFileSize,
} from "./book-files";
import {
  BookUploadError,
  deleteBookFile,
  uploadBookFile,
} from "./book-file-upload";
import { t } from "./i18n";

/**
 * Файлы книги на странице материала: список со ссылками на скачивание, а
 * автору и админу — ещё заливка и снятие.
 *
 * Без файлов и без права их добавлять секции нет вовсе: пустой заголовок
 * «Файлы книги» у видео или статьи только сбивал бы с толку.
 */
export function EntryFiles({
  locale,
  entryId,
  files,
  canEdit,
}: {
  locale: LibraryLocale;
  entryId: string;
  files: LibraryEntryFileDto[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Доля залитого; `null` — заливки нет. */
  const [progress, setProgress] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0 && !canEdit) return null;

  async function handleFile(file: File) {
    setError(null);
    const rejection = bookFileRejection(file, files.length);
    if (rejection) {
      setError(t(locale, rejection));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setProgress(0);
    try {
      await uploadBookFile(entryId, file, setProgress);
      router.refresh();
    } catch (cause) {
      setError(
        t(
          locale,
          cause instanceof BookUploadError
            ? bookUploadErrorKey(cause.code)
            : "files.failed",
        ),
      );
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(file: LibraryEntryFileDto) {
    if (!window.confirm(t(locale, "files.removeConfirm"))) return;
    setError(null);
    setRemovingId(file.id);
    try {
      await deleteBookFile(entryId, file.id);
      router.refresh();
    } catch {
      setError(t(locale, "files.removeFailed"));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section
      aria-labelledby="entry-files-title"
      className="glass mb-6 rounded-2xl border border-glass-brd p-4 text-sm"
    >
      <h2
        id="entry-files-title"
        className="mb-3 font-display text-base font-semibold text-text-0"
      >
        {t(locale, "files.title")}
      </h2>

      {files.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2">
              {/* Ссылка подписана хранилищем: PDF откроется в браузере, epub
                  и djvu скачаются под своим именем. */}
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 flex-1 items-center gap-2 text-text-0 hover:underline"
              >
                <Download aria-hidden className="h-4 w-4 shrink-0" />
                <span className="truncate">{file.name}</span>
              </a>
              <span className="font-mono text-xs text-text-2">
                {file.format.toUpperCase()} ·{" "}
                {formatFileSize(file.sizeBytes, locale)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleRemove(file)}
                  disabled={removingId === file.id}
                  aria-label={`${t(locale, "files.remove")}: ${file.name}`}
                  title={t(locale, "files.remove")}
                  className="rounded-lg p-1.5 text-text-2 hover:text-text-0 disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div>
          {/* Поле выбора спрятано визуально, но не для клавиатуры: `sr-only`,
              а не `hidden`, — иначе до него не дойти табом. Обводку фокуса
              показывает сама кнопка-подпись. */}
          <label className="inline-block cursor-pointer rounded-xl border border-glass-brd px-3 py-1.5 text-text-1 hover:text-text-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-magenta">
            {progress === null
              ? t(locale, "files.upload")
              : `${t(locale, "files.uploading")} ${Math.round(progress * 100)}%`}
            <input
              ref={inputRef}
              type="file"
              accept={BOOK_FILE_ACCEPT}
              disabled={progress !== null}
              aria-describedby="entry-files-hint"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="sr-only"
            />
          </label>
          <p id="entry-files-hint" className="mt-2 text-xs text-text-2">
            {t(locale, "files.hint")}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-text-0">
          {error}
        </p>
      )}
    </section>
  );
}
