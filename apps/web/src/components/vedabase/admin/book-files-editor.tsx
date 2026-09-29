"use client";

import { useEffect, useRef, useState } from "react";
import type { VedabaseBookFileDto } from "@vedamatch/shared";
import { fetchVedabaseAdminBookFiles } from "@/lib/vedabase-client-api";
import {
  BOOK_FILE_ACCEPT,
  bookFileRejection,
  bookUploadMessage,
  formatFileSize,
} from "@/lib/vedabase/book-files";
import {
  BookUploadError,
  deleteBookFile,
  uploadBookFile,
} from "./book-file-upload";

/**
 * Файлы книги для скачивания в админке (VED-662, часть 3б): список, заливка
 * с полосой прогресса и снятие. Грузится, когда раздел раскрыли: ссылки
 * подписываются на каждый запрос, и тянуть их для всех книг сразу незачем.
 */
export function BookFilesEditor({ slug }: { slug: string }) {
  const [files, setFiles] = useState<VedabaseBookFileDto[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVedabaseAdminBookFiles(slug)
      .then((loaded) => {
        if (cancelled) return;
        setFiles(loaded);
        setListFailed(false);
      })
      .catch(() => {
        if (!cancelled) setListFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  async function upload(file: File) {
    const rejection = bookFileRejection(file, files?.length ?? 0);
    if (rejection) {
      setMessage(bookUploadMessage(rejection));
      return;
    }
    setMessage(null);
    setProgress(0);
    try {
      const saved = await uploadBookFile(slug, file, setProgress);
      setFiles((current) => [...(current ?? []), saved]);
      setMessage(`Загружено: ${saved.name}`);
    } catch (error) {
      setMessage(
        bookUploadMessage(error instanceof BookUploadError ? error.code : ""),
      );
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(file: VedabaseBookFileDto) {
    if (!window.confirm(`Убрать файл «${file.name}»?`)) return;
    try {
      await deleteBookFile(slug, file.id);
      setFiles((current) =>
        (current ?? []).filter((item) => item.id !== file.id),
      );
    } catch {
      setMessage("Не удалось убрать файл.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {listFailed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-text-1">
            Не удалось загрузить список файлов.
          </p>
          <button
            type="button"
            onClick={() => {
              setListFailed(false);
              setAttempt((current) => current + 1);
            }}
            className="min-h-9 rounded-lg bg-bg-2 px-3 text-sm font-semibold text-text-0 hover:bg-bg-1"
          >
            Повторить
          </button>
        </div>
      ) : files === null ? (
        <p className="text-sm text-text-2">Загружаем…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-text-2">
          Файлов нет — читатели не увидят кнопку «Скачать».
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-bg-2 px-3 py-2"
            >
              <span className="rounded-md bg-bg-1 px-2 py-0.5 font-mono text-xs font-bold uppercase text-text-1">
                {file.format}
              </span>
              <a
                href={file.url}
                className="min-w-0 flex-grow truncate text-sm text-text-0 hover:text-magenta"
              >
                {file.name}
              </a>
              <span className="font-mono text-xs text-text-2">
                {formatFileSize(file.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => void remove(file)}
                className="min-h-9 rounded-lg px-2 text-xs font-semibold text-magenta hover:bg-bg-1"
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1 text-sm text-text-1">
        Добавить файл (до 100 МБ): pdf, epub, fb2, djvu, mobi, doc, docx, odt,
        rtf, txt
        <input
          ref={input}
          type="file"
          accept={BOOK_FILE_ACCEPT}
          // Без списка не знаем, сколько файлов у книги уже есть.
          disabled={progress !== null || files === null}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          className="text-sm text-text-0 file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-bg-2 file:px-3 file:text-text-0"
        />
      </label>
      {progress !== null && (
        <div
          role="progressbar"
          aria-label="Загрузка файла"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-bg-2"
        >
          <div
            className="h-full rounded-full bg-magenta"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-text-1">
          {message}
        </p>
      )}
    </div>
  );
}
