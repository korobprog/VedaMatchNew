"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { VedabaseBookFileDto } from "@vedamatch/shared";
import { fetchVedabaseBookFiles } from "@/lib/vedabase-client-api";
import { formatFileSize } from "@/lib/vedabase/book-files";

/**
 * «Скачать книгу» (VED-662, часть 3б): файлы, которые админ залил к книге, —
 * epub для читалки в телефоне, fb2, pdf для печати. Ссылки подписаны на
 * шесть часов, поэтому список берётся при открытии, а не хранится.
 */
export function BookDownloads({ bookSlug }: { bookSlug: string }) {
  const [files, setFiles] = useState<VedabaseBookFileDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchVedabaseBookFiles(bookSlug)
      .then(setFiles)
      .catch(() => setFailed(true));
  }, [bookSlug]);

  if (failed)
    return (
      <p className="reader-muted text-sm">
        Не удалось получить файлы — нужна связь с интернетом.
      </p>
    );
  if (!files) return <p className="reader-muted text-sm">Загружаем…</p>;
  if (files.length === 0)
    return (
      <p className="reader-muted text-sm">
        Файлов для скачивания у этой книги пока нет. Читать её можно здесь, а
        сохранить для чтения без сети — на полке.
      </p>
    );

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <a
            href={file.url}
            download={file.name}
            className="reader-subtle reader-hover flex min-h-12 items-center gap-3 rounded-xl px-3 py-2"
          >
            <Download aria-hidden className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-grow flex-col">
              <span className="truncate text-sm font-semibold">
                {file.name}
              </span>
              <span className="reader-muted text-xs">
                {file.format.toUpperCase()} · {formatFileSize(file.sizeBytes)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
