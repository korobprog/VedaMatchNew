"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AdminAnnouncementImageDto,
  AnnouncementImageUploadResponse,
} from "@vedamatch/shared";
import { ANNOUNCEMENT_MAX_IMAGES } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  NEWS_IMAGE_ACCEPT,
  pastedNewsImages,
  pickNewsUploads,
} from "@/lib/news-images";

const API_URL = apiBase();

/**
 * Картинки в форме новости (VED-137). Загружаются сразу при выборе — и к
 * новости, которой в базе ещё нет: форма запоминает ключи и отдаёт их при
 * сохранении. Скриншот вставляется из буфера (Ctrl+V), пока фокус в форме
 * новости — в заголовке или тексте, куда человек и так смотрит.
 */
export function AnnouncementImagesField({
  images,
  onChange,
}: {
  images: AdminAnnouncementImageDto[];
  /** Получает функцию-обновление: загрузка асинхронная, список мог смениться. */
  onChange: (
    update: (current: AdminAnnouncementImageDto[]) => AdminAnnouncementImageDto[],
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fieldRef = useRef<HTMLFieldSetElement>(null);

  async function upload(files: File[]) {
    const { upload: accepted, rejected } = pickNewsUploads(
      files,
      images.length,
      ANNOUNCEMENT_MAX_IMAGES,
    );
    setErrors(rejected);
    if (accepted.length === 0) return;
    setPending(true);
    try {
      const body = new FormData();
      for (const file of accepted) body.append("files", file, file.name);
      const res = await apiFetch(`${API_URL}/admin/changelog/announcement-images`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as AnnouncementImageUploadResponse;
      onChange((current) =>
        [...current, ...result.images].slice(0, ANNOUNCEMENT_MAX_IMAGES),
      );
      setErrors([
        ...rejected,
        ...result.failed.map((item) => `${item.fileName}: ${item.message}`),
      ]);
    } catch {
      setErrors([...rejected, "Не удалось загрузить картинки. Попробуйте ещё раз."]);
    } finally {
      setPending(false);
    }
  }

  // Обработчик вставки живёт дольше рендера — берёт свежую `upload` по ссылке.
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // Только вставка внутри своей формы: открытых форм правки бывает
      // несколько, и картинка не должна уехать во все сразу.
      const form = fieldRef.current?.closest("[data-news-form]");
      if (!form || !(event.target instanceof Node) || !form.contains(event.target))
        return;
      const files = pastedNewsImages(event.clipboardData?.files);
      if (files.length === 0) return;
      event.preventDefault();
      void uploadRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const full = images.length >= ANNOUNCEMENT_MAX_IMAGES;

  return (
    <fieldset ref={fieldRef} className="space-y-2">
      <legend className="text-sm text-text-1">
        Картинки{" "}
        <span className="text-xs text-text-2">
          ({images.length} из {ANNOUNCEMENT_MAX_IMAGES})
        </span>
      </legend>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- картинка лежит в нашем S3 */}
              <img
                src={image.url}
                alt={`Картинка ${index + 1}`}
                className="h-20 w-28 rounded-lg border border-glass-brd object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  onChange((current) =>
                    current.filter((item) => item.key !== image.key),
                  )
                }
                aria-label={`Убрать картинку ${index + 1}`}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg-0/85 text-sm text-text-0 hover:bg-bg-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || full}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          {pending ? "Загружаем…" : "Добавить картинки"}
        </button>
        <span className="text-xs text-text-2">
          {full
            ? "Больше картинок не поместится"
            : "JPG, PNG или WebP. Скриншот можно вставить в форму через Ctrl+V."}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={NEWS_IMAGE_ACCEPT}
          multiple
          hidden
          data-testid="news-images-input"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-red-400">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
