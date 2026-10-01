"use client";

import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { BlogAlbumPhotoDto } from "@vedamatch/shared";
import {
  albumErrorText,
  albumPreflight,
  uploadAlbumPhotos,
} from "@/lib/blog-album";
import { BlogAuthorAlbumViewer } from "./blog-author-album-viewer";

const PREVIEW_COUNT = 12;

/**
 * «Фотоальбом» на личной странице (VED-686, часть 3). Хозяин заливает фото,
 * подписывает и убирает; гость листает, а пустой альбом чужой страницы не
 * показывается.
 */
export function BlogAuthorAlbum({
  initial,
  mine,
}: {
  initial: BlogAlbumPhotoDto[];
  mine: boolean;
}) {
  const [photos, setPhotos] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [uploading, setUploading] = useState(0);
  /**
   * Обрыв случился при скрытой странице, и заливка ждёт возвращения: это
   * не ошибка, и красное показывать рано (VED-684).
   */
  const [waiting, setWaiting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  /**
   * Снимки, что не долились из-за связи: их повторяет кнопка «Повторить».
   * Отказ сервера сюда не попадает — те же файлы получат тот же отказ.
   */
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  if (!mine && photos.length === 0) return null;

  const shown = expanded ? photos : photos.slice(0, PREVIEW_COUNT);

  /** Заливка пачки — общая для выбора файлов и для «Повторить». */
  async function uploadAll(
    picked: File[],
  ): Promise<{ failed: string[]; lost: File[] }> {
    setUploading(picked.length);
    try {
      const res = await uploadAlbumPhotos(picked, { onWaiting: setWaiting });
      setPhotos((prev) => [...res.photos, ...prev]);
      return {
        failed: res.failed.map((f) => `${f.name}: ${albumErrorText(f.reason)}`),
        lost: res.failed
          .filter((f) => f.reason === "network")
          .map((f) => picked.find((file) => file.name === f.name))
          .filter((file): file is File => Boolean(file)),
      };
    } finally {
      setUploading(0);
    }
  }

  async function onPick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    setErrors([]);
    setRetryFiles([]);
    const { accepted, rejected } = albumPreflight(picked, photos.length);
    const failed = rejected.map(
      (r) => `${r.name}: ${albumErrorText(r.reason)}`,
    );
    let lost: File[] = [];
    if (accepted.length > 0) {
      const result = await uploadAll(accepted);
      failed.push(...result.failed);
      lost = result.lost;
    }
    setErrors(failed);
    setRetryFiles(lost);
  }

  /** «Повторить»: только те снимки, что не долились из-за связи (VED-684). */
  async function retry() {
    if (retryFiles.length === 0 || uploading > 0) return;
    setErrors([]);
    const { failed, lost } = await uploadAll(retryFiles);
    setErrors(failed);
    setRetryFiles(lost);
  }

  function onChanged(photo: BlogAlbumPhotoDto) {
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? photo : p)));
  }

  function onDeleted(id: string) {
    const at = photos.findIndex((p) => p.id === id);
    const rest = photos.filter((p) => p.id !== id);
    setPhotos(rest);
    setOpen(rest.length === 0 ? null : Math.min(at, rest.length - 1));
  }

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
          Фотоальбом
        </h2>
        {mine && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading > 0}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
            >
              <Plus aria-hidden className="size-4" />
              Добавить фото
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-label="Выбрать фото"
              data-testid="album-photo-input"
              onChange={(event) => void onPick(event.target.files)}
            />
          </>
        )}
      </div>

      {uploading > 0 && (
        <p role="status" className="mt-3 text-xs text-text-1">
          Загружаю {uploading} фото…
          {waiting && " · Ждём возвращения в приложение…"}
        </p>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1">
          {errors.map((text) => (
            // Причина — красной строкой, «Повторить» под ней: так же устроена
            // загрузка записи (VED-684).
            <li key={text} className="text-xs">
              <span className="block text-magenta">{text}</span>
            </li>
          ))}
          {retryFiles.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => void retry()}
                disabled={uploading > 0}
                className="min-h-11 text-left text-sm font-semibold text-magenta underline underline-offset-2 disabled:opacity-50"
              >
                Повторить
              </button>
            </li>
          )}
        </ul>
      )}

      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-text-1">
          Пока ни одной фотографии. Добавьте снимки — их увидят те, кто зайдёт
          на вашу страницу.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-3 gap-1 sm:gap-2">
            {shown.map((photo, i) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="block w-full rounded-lg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || `Фото ${i + 1}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
          {photos.length > PREVIEW_COUNT && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-text-0 hover:bg-bg-2"
            >
              {expanded ? "Свернуть" : `Показать все (${photos.length})`}
            </button>
          )}
        </>
      )}

      {open !== null && (
        <BlogAuthorAlbumViewer
          photos={photos}
          index={Math.min(open, photos.length - 1)}
          mine={mine}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}
