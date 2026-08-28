"use client";

import { useId, useState } from "react";
import type { MusicCoverScope } from "@vedamatch/shared";
import { MUSIC_COVER_ACCEPTED_MIME } from "@vedamatch/shared";
import { uploadMusicCover } from "@/lib/music-client-api";

/**
 * Выбор обложки.
 *
 * Заливка идёт сразу по выбору файла, а ключ отдаётся наружу: сохранять его
 * будет форма вместе с остальной карточкой. Разнесено так намеренно —
 * картинка в бакете ничего не значит, пока её ключ не записан, и человек
 * вправе передумать, ничего этим не сломав.
 *
 * Предпросмотр берётся из самого файла через `createObjectURL`, а не из
 * бакета: обложка публичная, но CDN отдаст её не сразу, и пустой квадрат
 * сразу после заливки читался бы как отказ.
 */
export function MusicCoverField({
  scope,
  value,
  onChange,
  label = "Обложка",
}: {
  scope: MusicCoverScope;
  /** Ключ залитой обложки: `null` — обложки нет. */
  value: string | null;
  onChange: (coverKey: string | null) => void;
  label?: string;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const coverKey = await uploadMusicCover(file, scope, setProgress);
      // Прошлый URL отзываем: браузер держит файл в памяти, пока его не
      // освободят, а обложку можно перевыбирать сколько угодно раз.
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      onChange(coverKey);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось загрузить обложку",
      );
    } finally {
      setProgress(null);
    }
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    onChange(null);
  }

  const hasCover = Boolean(value);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-2">{label}</span>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-glass-brd bg-bg-1"
        >
          {preview ? (
            // Локальный предпросмотр из выбранного файла: next/image здесь
            // не годится — адреса нет, есть blob текущей вкладки.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="size-5 text-text-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-glass-brd bg-glass px-3 text-xs font-semibold text-text-1 hover:text-text-0"
            >
              {hasCover ? "Заменить" : "Выбрать файл"}
            </label>
            <input
              id={inputId}
              type="file"
              accept={MUSIC_COVER_ACCEPTED_MIME.join(",")}
              className="sr-only"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            {hasCover && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-8 items-center rounded-lg border border-glass-brd px-3 text-xs font-semibold text-text-2 hover:text-magenta"
              >
                Снять
              </button>
            )}
          </div>
          <span className="text-[11px] text-text-2">
            JPEG, PNG или WebP, до 2 МБ. Квадрат смотрится ровнее.
          </span>
        </div>
      </div>

      {progress !== null && (
        <div
          role="progressbar"
          aria-label="Загрузка обложки"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 overflow-hidden rounded-full bg-glass-brd"
        >
          <div
            className="h-full rounded-full bg-mint transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {error && <span className="text-xs text-magenta">{error}</span>}
    </div>
  );
}
