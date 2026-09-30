"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { BLOG_ALBUM_CAPTION_MAX_LENGTH } from "@vedamatch/shared";
import type { BlogAlbumPhotoDto } from "@vedamatch/shared";
import {
  BlogApiError,
  albumErrorText,
  deleteAlbumPhoto,
  updateAlbumCaption,
} from "@/lib/blog-album";

const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-1 hover:bg-bg-2 hover:text-text-0 disabled:opacity-60";

function errorCode(cause: unknown): string {
  return cause instanceof BlogApiError ? cause.code : "network";
}

/** Просмотр фото в модальном `<dialog>`; хозяину — подпись и удаление. */
export function BlogAuthorAlbumViewer({
  photos,
  index,
  mine,
  onIndex,
  onClose,
  onChanged,
  onDeleted,
}: {
  photos: BlogAlbumPhotoDto[];
  index: number;
  mine: boolean;
  onIndex: (next: number) => void;
  onClose: () => void;
  onChanged: (photo: BlogAlbumPhotoDto) => void;
  onDeleted: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = photos[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    // jsdom и старые браузеры без `showModal`: открываем атрибутом.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  if (!photo) return null;

  const prev = () => onIndex((index - 1 + photos.length) % photos.length);
  const next = () => onIndex((index + 1) % photos.length);

  function onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Просмотр фото"
      onClose={onClose}
      onKeyDown={onKeyDown}
      className="m-auto max-h-[96dvh] w-[min(96vw,44rem)] overflow-y-auto rounded-2xl border border-glass-brd bg-bg-0 p-4 text-text-0 backdrop:bg-bg-0/80"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-1" aria-live="polite">
          {index + 1} из {photos.length}
        </p>
        <button
          type="button"
          onClick={() => dialogRef.current?.close?.() ?? onClose()}
          aria-label="Закрыть"
          className={ICON_BUTTON}
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={prev}
          aria-label="Предыдущее фото"
          disabled={photos.length < 2}
          className={ICON_BUTTON}
        >
          <ChevronLeft aria-hidden className="size-6" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || `Фото ${index + 1}`}
          className="mx-auto max-h-[80vh] min-w-0 flex-1 rounded-lg object-contain"
        />
        <button
          type="button"
          onClick={next}
          aria-label="Следующее фото"
          disabled={photos.length < 2}
          className={ICON_BUTTON}
        >
          <ChevronRight aria-hidden className="size-6" />
        </button>
      </div>

      {photo.caption && !mine && (
        <p className="mt-3 whitespace-pre-line text-sm text-text-0">
          {photo.caption}
        </p>
      )}

      {mine && (
        <OwnerControls
          key={photo.id}
          photo={photo}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      )}
    </dialog>
  );
}

function OwnerControls({
  photo,
  onChanged,
  onDeleted,
}: {
  photo: BlogAlbumPhotoDto;
  onChanged: (photo: BlogAlbumPhotoDto) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState(photo.caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = `album-caption-${photo.id}`;
  const dirty = draft.trim() !== (photo.caption ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await updateAlbumCaption(photo.id, draft.trim()));
    } catch (cause) {
      setError(albumErrorText(errorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Удалить это фото из альбома?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAlbumPhoto(photo.id);
      onDeleted(photo.id);
    } catch (cause) {
      setError(albumErrorText(errorCode(cause)));
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <label htmlFor={fieldId} className="text-xs text-text-1">
        Подпись
      </label>
      <textarea
        id={fieldId}
        value={draft}
        maxLength={BLOG_ALBUM_CAPTION_MAX_LENGTH}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-1 p-2 text-sm text-text-0"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-1">
          {draft.length} / {BLOG_ALBUM_CAPTION_MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="ml-auto min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          aria-label="Удалить фото"
          className={ICON_BUTTON}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-text-0">
          {error}
        </p>
      )}
    </div>
  );
}
