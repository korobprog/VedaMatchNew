"use client";

import { useId, useRef, useState } from "react";
import { FileText, Film, Music, Plus, Trash2 } from "lucide-react";
import type { BlogAuthorFileDto, BlogAuthorFileKind } from "@vedamatch/shared";
import {
  AUTHOR_FILE_ACCEPT,
  AuthorFileError,
  authorFileErrorText,
  authorFilePreflight,
  deleteAuthorFile,
  formatBytes,
  uploadAuthorFile,
} from "@/lib/blog-author-files";

const KIND_LABEL: Record<BlogAuthorFileKind, string> = {
  audio: "Аудио",
  video: "Видео",
  document: "Тексты",
};
const KINDS: BlogAuthorFileKind[] = ["audio", "video", "document"];
const ICONS = { audio: Music, video: Film, document: FileText };

type Filter = "all" | BlogAuthorFileKind;

/**
 * «Файлы» на личной странице (VED-686, часть 2): аудио, видео и документы
 * автора. Хозяин заливает и убирает файлы на месте; гость смотрит, а пустой
 * блок чужой страницы не показывается.
 */
export function BlogAuthorFiles({
  initial,
  mine,
}: {
  initial: BlogAuthorFileDto[];
  mine: boolean;
}) {
  const [files, setFiles] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState<{
    name: string;
    fraction: number;
  } | null>(null);
  /**
   * Обрыв случился при скрытой странице, и заливка ждёт возвращения: это
   * не ошибка, и красное показывать рано (VED-684).
   */
  const [waiting, setWaiting] = useState(false);
  /**
   * Неудачи строками. `file` держит сам файл — по нему работает «Повторить»;
   * у отказа до заливки (не тот формат, слишком большой) повтора нет.
   */
  const [errors, setErrors] = useState<
    { text: string; file: File | null }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  if (!mine && files.length === 0) return null;

  const present = KINDS.filter((kind) => files.some((f) => f.kind === kind));
  const active: Filter =
    filter === "all" || present.includes(filter) ? filter : "all";
  const shown =
    active === "all" ? files : files.filter((f) => f.kind === active);

  async function onPick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    setErrors([]);
    let count = files.length;
    const failed: { text: string; file: File | null }[] = [];
    for (const file of picked) {
      const rejection = authorFilePreflight(file, count);
      if (rejection) {
        failed.push({
          text: `${file.name}: ${authorFileErrorText(rejection)}`,
          file: null,
        });
        continue;
      }
      setUploading({ name: file.name, fraction: 0 });
      try {
        const created = await uploadOne(file);
        setFiles((prev) => [created, ...prev]);
        count += 1;
      } catch (cause) {
        const code = cause instanceof AuthorFileError ? cause.code : "network";
        failed.push({
          text: `${file.name}: ${authorFileErrorText(code)}`,
          file,
        });
      }
    }
    setUploading(null);
    setErrors(failed);
  }

  /** Заливка одного файла — общая для пачки и для «Повторить». */
  function uploadOne(file: File): Promise<BlogAuthorFileDto> {
    return uploadAuthorFile(
      file,
      (fraction) => setUploading({ name: file.name, fraction }),
      { onWaiting: setWaiting },
    );
  }

  /** «Повторить»: только этот файл, остальные строки ошибок не трогаем. */
  async function retry(entry: { text: string; file: File | null }) {
    if (!entry.file || uploading) return;
    setUploading({ name: entry.file.name, fraction: 0 });
    try {
      const created = await uploadOne(entry.file);
      setFiles((prev) => [created, ...prev]);
      setErrors((prev) => prev.filter((item) => item !== entry));
    } catch (cause) {
      const code = cause instanceof AuthorFileError ? cause.code : "network";
      setErrors((prev) =>
        prev.map((item) =>
          item === entry
            ? {
                text: `${entry.file!.name}: ${authorFileErrorText(code)}`,
                file: entry.file,
              }
            : item,
        ),
      );
    } finally {
      setUploading(null);
    }
  }

  async function remove(file: BlogAuthorFileDto) {
    if (!window.confirm(`Удалить «${file.name}»?`)) return;
    try {
      await deleteAuthorFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (cause) {
      const code = cause instanceof AuthorFileError ? cause.code : "network";
      setErrors([
        { text: `${file.name}: ${authorFileErrorText(code)}`, file: null },
      ]);
    }
  }

  const percent = uploading ? Math.round(uploading.fraction * 100) : 0;

  return (
    <section
      aria-labelledby={`${titleId}-title`}
      className="mb-6 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={`${titleId}-title`}
          className="font-display text-sm font-semibold text-text-0"
        >
          Файлы
        </h2>
        {mine && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading !== null}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
            >
              <Plus aria-hidden className="size-4" />
              Добавить файл
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={AUTHOR_FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Выбрать файлы"
              data-testid="author-file-input"
              onChange={(event) => void onPick(event.target.files)}
            />
          </>
        )}
      </div>

      {mine && (
        <p className="mt-2 text-xs text-text-1">
          Подходят аудио (до 200 МБ), видео (до 1 ГБ) и документы (до 100 МБ):
          pdf, epub, fb2, doc, txt и другие. Не больше 50 файлов.
        </p>
      )}

      {present.length > 1 && (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Вид файлов"
        >
          {(["all", ...present] as Filter[]).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={active === kind}
              onClick={() => setFilter(kind)}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm ${
                active === kind
                  ? "bg-bg-2 font-semibold text-text-0"
                  : "text-text-1 hover:bg-bg-2"
              }`}
            >
              {kind === "all" ? "Все" : KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      )}

      {uploading && (
        <div className="mt-3">
          <p className="truncate text-xs text-text-1">
            Загружаю: {uploading.name}
            {waiting && " · Ждём возвращения в приложение…"}
          </p>
          <div
            role="progressbar"
            aria-label={`Загрузка ${uploading.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-1 h-2 overflow-hidden rounded-full bg-bg-2"
          >
            <div
              className="h-full bg-mint transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1">
          {errors.map((item, index) => (
            // Причина — красной строкой, «Повторить» под ней: так же устроена
            // загрузка записи (VED-684).
            <li
              key={`${item.text}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 text-xs"
            >
              <span className="basis-full text-magenta">{item.text}</span>
              {item.file && (
                <button
                  type="button"
                  onClick={() => void retry(item)}
                  disabled={uploading !== null}
                  className="min-h-11 basis-full self-start text-left text-sm font-semibold text-magenta underline underline-offset-2 disabled:opacity-50"
                >
                  Повторить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 ? (
        <p className="mt-3 text-sm text-text-1">
          Пока ни одного файла. Добавьте аудио, видео или документы — их увидят
          те, кто зайдёт на вашу страницу.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shown.map((file) => {
            const Icon = ICONS[file.kind];
            return (
              <li
                key={file.id}
                className="rounded-xl border border-glass-brd bg-bg-1 p-3"
              >
                <div className="flex items-center gap-2">
                  <Icon aria-hidden className="size-5 shrink-0 text-text-1" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-0">
                      {file.name}
                    </p>
                    <p className="text-xs text-text-1">
                      {formatBytes(file.sizeBytes)}
                    </p>
                  </div>
                  {file.kind === "document" && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-text-0 hover:bg-bg-2"
                    >
                      Открыть
                    </a>
                  )}
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void remove(file)}
                      aria-label={`Удалить ${file.name}`}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-1 hover:bg-bg-2 hover:text-text-0"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  )}
                </div>
                {file.kind === "audio" && (
                  <audio
                    controls
                    preload="none"
                    src={file.url}
                    className="mt-2 w-full"
                  />
                )}
                {file.kind === "video" && (
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    src={file.url}
                    className="mt-2 w-full max-w-full rounded-lg"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
