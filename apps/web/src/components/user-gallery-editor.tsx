"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  UserGalleryState,
  UserPhotoDto,
  UserPhotoUploadResponse,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp";

type UploadNotice = {
  id: number;
  kind: "success" | "error";
  message: string;
};

type GalleryMutation = "upload" | "visibility" | "delete" | "reorder";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function movePhoto(
  photos: UserPhotoDto[],
  draggedId: string,
  targetId: string,
): UserPhotoDto[] {
  const from = photos.findIndex((photo) => photo.id === draggedId);
  const to = photos.findIndex((photo) => photo.id === targetId);
  if (from < 0 || to < 0 || from === to) return photos;

  const reordered = [...photos];
  const [dragged] = reordered.splice(from, 1);
  reordered.splice(to, 0, dragged);
  return reordered;
}

export function UserGalleryEditor(): React.ReactNode {
  const [gallery, setGallery] = useState<UserGalleryState | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMutation, setActiveMutation] = useState<GalleryMutation | null>(
    null,
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeId = useRef(0);
  const activeMutationRef = useRef<GalleryMutation | null>(null);
  const uploading = activeMutation === "upload";
  const isMutating = activeMutation !== null;

  function beginMutation(mutation: GalleryMutation): boolean {
    if (activeMutationRef.current) return false;
    activeMutationRef.current = mutation;
    setActiveMutation(mutation);
    return true;
  }

  function finishMutation() {
    activeMutationRef.current = null;
    setActiveMutation(null);
  }

  function addNotice(kind: UploadNotice["kind"], message: string) {
    noticeId.current += 1;
    const id = noticeId.current;
    setNotices((current) => [
      ...current,
      { id, kind, message },
    ]);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadGallery() {
      try {
        const response = await fetch(`${API_URL}/profile/photos`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await response.text());
        setGallery((await response.json()) as UserGalleryState);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        addNotice("error", "Не удалось загрузить галерею");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadGallery();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const validFiles: File[] = [];

    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        addNotice(
          "error",
          `${file.name}: разрешены только JPG, PNG и WebP`,
        );
      } else if (file.size > MAX_FILE_BYTES) {
        addNotice("error", `${file.name}: размер файла превышает 20 МБ`);
      } else {
        validFiles.push(file);
      }
    }

    const urls = validFiles.map((file) => URL.createObjectURL(file));
    setSelectedFiles(validFiles);
    setPreviewUrls(urls);
  }

  async function uploadSelected() {
    if (selectedFiles.length === 0 || !beginMutation("upload")) return;

    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      const response = await fetch(`${API_URL}/profile/photos`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());

      const result = (await response.json()) as UserPhotoUploadResponse;
      setGallery((current) => ({
        photos: [
          ...(current?.photos ?? []),
          ...result.uploaded.map(({ photo }) => photo),
        ].sort((a, b) => a.sortOrder - b.sortOrder),
        usedBytes: result.usedBytes,
        quotaBytes: result.quotaBytes,
      }));

      for (const uploaded of result.uploaded) {
        addNotice("success", `${uploaded.fileName}: фото загружено как приватное`);
      }
      for (const failed of result.failed) {
        addNotice("error", `${failed.fileName}: ${failed.message}`);
      }

      setSelectedFiles([]);
      setPreviewUrls([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      addNotice("error", "Не удалось загрузить выбранные фото");
    } finally {
      finishMutation();
    }
  }

  async function toggleVisibility(photo: UserPhotoDto) {
    if (!beginMutation("visibility")) return;
    const previous = photo.isPublic;
    const next = !previous;
    setGallery((current) =>
      current
        ? {
            ...current,
            photos: current.photos.map((item) =>
              item.id === photo.id ? { ...item, isPublic: next } : item,
            ),
          }
        : current,
    );

    try {
      const response = await fetch(
        `${API_URL}/profile/photos/${encodeURIComponent(photo.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isPublic: next }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const updated = (await response.json()) as UserPhotoDto;
      setGallery((current) =>
        current
          ? {
              ...current,
              photos: current.photos.map((item) =>
                item.id === photo.id ? updated : item,
              ),
            }
          : current,
      );
    } catch {
      setGallery((current) =>
        current
          ? {
              ...current,
              photos: current.photos.map((item) =>
                item.id === photo.id
                  ? { ...item, isPublic: previous }
                  : item,
              ),
            }
          : current,
      );
      addNotice("error", "Не удалось изменить видимость фото");
    } finally {
      finishMutation();
    }
  }

  async function deletePhoto(photo: UserPhotoDto) {
    if (!window.confirm("Удалить это фото без возможности восстановления?")) {
      return;
    }

    if (!beginMutation("delete")) return;
    try {
      const response = await fetch(
        `${API_URL}/profile/photos/${encodeURIComponent(photo.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      setGallery((current) =>
        current
          ? {
              ...current,
              photos: current.photos.filter((item) => item.id !== photo.id),
              usedBytes: Math.max(0, current.usedBytes - photo.sizeBytes),
            }
          : current,
      );
      addNotice("success", "Фото удалено");
    } catch {
      addNotice("error", "Не удалось удалить фото");
    } finally {
      finishMutation();
    }
  }

  async function reorderPhotos(draggedPhotoId: string, targetId: string) {
    if (!gallery || !beginMutation("reorder")) return;
    const previous = gallery.photos;
    const reordered = movePhoto(previous, draggedPhotoId, targetId);
    setDraggedId(null);
    if (reordered === previous) {
      finishMutation();
      return;
    }

    setGallery({ ...gallery, photos: reordered });
    try {
      const response = await fetch(`${API_URL}/profile/photos/order`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoIds: reordered.map((photo) => photo.id) }),
      });
      if (!response.ok) throw new Error(await response.text());
      setGallery((await response.json()) as UserGalleryState);
    } catch {
      setGallery((current) =>
        current ? { ...current, photos: previous } : current,
      );
      addNotice("error", "Не удалось сохранить порядок фото");
    } finally {
      finishMutation();
    }
  }

  async function moveWithKeyboard(photoId: string, offset: -1 | 1) {
    if (!gallery) return;
    const index = gallery.photos.findIndex((photo) => photo.id === photoId);
    const target = gallery.photos[index + offset];
    if (!target) return;
    await reorderPhotos(photoId, target.id);
  }

  function handleDragKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    photoId: string,
  ) {
    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      void moveWithKeyboard(photoId, -1);
    } else if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      void moveWithKeyboard(photoId, 1);
    }
  }

  return (
    <section
      aria-labelledby="gallery-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2
        id="gallery-heading"
        className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
      >
        Галерея профиля
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Новые фото приватны. Откройте доступ, чтобы показать их в рекомендациях
        Union.
      </p>

      {gallery && (
        <div className="mt-4" aria-label="Использование хранилища">
          <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>Занято {formatBytes(gallery.usedBytes)}</span>
            <span>Доступно {formatBytes(gallery.quotaBytes)}</span>
          </div>
          <progress
            className="mt-2 h-2 w-full accent-amber-600"
            value={gallery.usedBytes}
            max={Math.max(gallery.quotaBytes, 1)}
          >
            {gallery.usedBytes} из {gallery.quotaBytes}
          </progress>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <label
          htmlFor="gallery-files"
          className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
        >
          Выберите несколько фото
        </label>
        <input
          ref={inputRef}
          id="gallery-files"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={selectFiles}
          disabled={isMutating}
          className="mt-3 block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
        <p className="mt-2 text-xs text-zinc-500">
          JPG, PNG или WebP до 20 МБ каждый.
        </p>

        {selectedFiles.length > 0 && (
          <div className="mt-4">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {selectedFiles.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrls[index]}
                    alt={`Предпросмотр ${file.name}`}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {file.name}
                  </p>
                  {uploading && (
                    <progress
                      aria-label={`Загрузка ${file.name}`}
                      className="mt-1 h-1 w-full accent-amber-600"
                    />
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={uploadSelected}
              disabled={isMutating}
              className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {uploading ? "Загружаем..." : "Загрузить выбранные фото"}
            </button>
          </div>
        )}
      </div>

      <div aria-live="polite" aria-atomic="false" className="mt-4 space-y-2">
        {notices.map((notice) => (
          <p
            key={notice.id}
            role={notice.kind === "error" ? "alert" : "status"}
            className={
              notice.kind === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"
                : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
            }
          >
            {notice.message}
          </p>
        ))}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500" role="status">
          Загружаем галерею...
        </p>
      ) : gallery && gallery.photos.length > 0 ? (
        <>
          <p className="mt-5 text-xs text-zinc-500">
            Перетаскивайте фото для изменения порядка. С клавиатуры используйте
            Alt + стрелки.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {gallery.photos.map((photo, index) => (
              <li key={photo.id}>
                <div
                  draggable={!isMutating}
                  tabIndex={0}
                  onDragStart={(event: DragEvent<HTMLDivElement>) => {
                    if (isMutating) return;
                    setDraggedId(photo.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", photo.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedId) void reorderPhotos(draggedId, photo.id);
                  }}
                  onKeyDown={(event) => handleDragKeyDown(event, photo.id)}
                  aria-label={`Фото ${photo.id}. Перетащите для изменения порядка`}
                  className={`overflow-hidden rounded-xl border bg-zinc-50 outline-none focus:ring-2 focus:ring-amber-500 dark:bg-zinc-800 ${
                    draggedId === photo.id
                      ? "border-amber-500 opacity-60"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt="Фото галереи профиля"
                    className="aspect-square w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="space-y-3 p-3">
                    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span>{photo.isPublic ? "Публичное" : "Приватное"}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Показывать фото ${photo.id} в Union`}
                        checked={photo.isPublic}
                        disabled={isMutating}
                        onChange={() => void toggleVisibility(photo)}
                        className="h-4 w-4 accent-amber-600"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void deletePhoto(photo)}
                      disabled={isMutating}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      aria-label={`Удалить фото ${photo.id}`}
                    >
                      Удалить
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void moveWithKeyboard(photo.id, -1)}
                        disabled={isMutating || index === 0}
                        aria-label={`Переместить фото ${photo.id} влево`}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        Влево
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveWithKeyboard(photo.id, 1)}
                        disabled={
                          isMutating || index === gallery.photos.length - 1
                        }
                        aria-label={`Переместить фото ${photo.id} вправо`}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-white disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        Вправо
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !loading && (
          <p className="mt-5 text-sm text-zinc-500">
            В галерее пока нет фотографий.
          </p>
        )
      )}
    </section>
  );
}
