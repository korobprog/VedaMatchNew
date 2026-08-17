"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  MAX_IMAGES_PER_NOTICE,
  type NoticeImageDto,
  type NoticeImageUploadFailure,
} from "@vedamatch/shared";
import {
  NoticesApiError,
  deleteNoticeImage,
  reorderNoticeImages,
  uploadNoticeImages,
} from "@/lib/notices-api";

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Выбор фотографий до создания объявления.
 *
 * Загрузить их сразу нельзя: сервер принимает файлы по адресу
 * `/notices/:id/images`, а id появляется только после публикации. Поэтому
 * здесь файлы просто копятся с превью, а форма отправляет их следом за
 * созданием.
 */
export function NoticeImagePicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  // Ссылки на объекты живут до отзыва: без этого каждая правка списка
  // подтекает памятью.
  useEffect(
    () => () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    },
    [previews],
  );

  const room = MAX_IMAGES_PER_NOTICE - files.length;

  return (
    <div>
      {previews.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <li key={preview.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр */}
              <img
                src={preview.url}
                alt=""
                className="h-24 w-24 rounded-xl border border-glass-brd object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label="Убрать фото"
                className="absolute right-1 top-1 rounded-lg border border-glass-brd bg-bg-0/80 p-1 text-text-2 hover:text-red-400"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-bg-0/80 px-1 text-[10px] text-text-1">
                  обложка
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []).slice(0, room);
          if (picked.length) onChange([...files, ...picked]);
          // Сбрасываем значение, иначе повторный выбор того же файла
          // не вызовет change.
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={room <= 0}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
      >
        <ImagePlus className="size-4" />
        {files.length ? "Добавить ещё" : "Добавить фото"}
      </button>
      <p className="mt-1 text-xs text-text-2">
        До {MAX_IMAGES_PER_NOTICE} фото, каждое до 10 МБ. Первое станет
        обложкой в ленте.
      </p>
    </div>
  );
}

/**
 * Фотографии уже опубликованного объявления: добавление, удаление, порядок.
 *
 * Порядок меняется стрелками, а не перетаскиванием: на телефоне drag-and-drop
 * конфликтует с прокруткой — та же причина, что в Рынке.
 */
export function NoticeImagesUpload({
  noticeId,
  images: initial,
  onChanged,
}: {
  noticeId: string;
  images: NoticeImageDto[];
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<NoticeImageUploadFailure[]>([]);

  // Подстройка состояния под новый проп делается во время рендера, а не
  // эффектом: setState в теле эффекта вызывает каскад перерисовок. Локальное
  // состояние нужно ради оптимистичной перестановки — стрелки должны
  // срабатывать мгновенно, не дожидаясь ответа сервера.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setImages(initial);
  }

  async function addFiles(picked: File[]) {
    if (pending || !picked.length) return;
    setPending(true);
    setError(null);
    setFailed([]);
    try {
      const response = await uploadNoticeImages(noticeId, picked);
      setImages(response.images);
      // Отказы по отдельным файлам показываем, а не глотаем: чаще всего это
      // «S3 не настроен» или слишком большой файл, и человек должен понимать,
      // почему фото не появилось.
      setFailed(response.failed);
      onChanged?.();
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не удалось загрузить");
    } finally {
      setPending(false);
    }
  }

  async function remove(imageId: string) {
    setError(null);
    try {
      await deleteNoticeImage(noticeId, imageId);
      setImages((current) => current.filter((image) => image.id !== imageId));
      onChanged?.();
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const before = images;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    setImages(reordered);
    try {
      // Сервер требует полный список: частичный порядок оставил бы дыры
      // в sortOrder и молча поменял обложку.
      await reorderNoticeImages(noticeId, {
        imageIds: reordered.map((image) => image.id),
      });
      onChanged?.();
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
      setImages(before);
    }
  }

  const room = MAX_IMAGES_PER_NOTICE - images.length;

  return (
    <div>
      {images.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3 */}
              <img
                src={image.url}
                alt=""
                className="h-24 w-24 rounded-xl border border-glass-brd object-cover"
              />
              <div className="mt-1 flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label="Левее"
                  className="rounded-lg border border-glass-brd px-1.5 text-xs text-text-2 hover:text-text-0 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === images.length - 1}
                  aria-label="Правее"
                  className="rounded-lg border border-glass-brd px-1.5 text-xs text-text-2 hover:text-text-0 disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => void remove(image.id)}
                  aria-label="Удалить фото"
                  className="rounded-lg border border-glass-brd px-1.5 text-text-2 hover:text-red-400"
                >
                  <Trash2 aria-hidden className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []).slice(0, room);
          void addFiles(picked);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending || room <= 0}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
      >
        <ImagePlus className="size-4" />
        {pending ? "Загружаем…" : "Добавить фото"}
      </button>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {failed.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-amber-300">
          {failed.map((failure) => (
            <li key={failure.fileName}>
              {failure.fileName}: {failure.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
