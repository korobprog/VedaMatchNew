"use client";

import type { ChangeEvent } from "react";
import { formatImageSize } from "./clipboard-image";
import {
  formatVideoDuration,
  VIDEO_MAX_SECONDS,
} from "./admin/video-file";
import { fieldLabelClass } from "./field-label";
import { tapFieldClass } from "./tap-target";

/** Выбранный ролик: файл, ссылка превью и длительность из его метаданных. */
export interface ReelVideoPick {
  file: File;
  /** Ссылка превью: её же показывает шаг проверки. */
  url: string;
  /** `null` — браузер не отдал метаданные; сервер у mp4/mov прочитает свою. */
  durationSeconds: number | null;
}

const videoFieldClass = tapFieldClass(
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0",
);

/**
 * Ветка «Добавить видео» (VED-696): выбор файла, превью и быстрый отказ до
 * любого следующего шага. Правила — те же, что у роликов ленты «Видео»
 * (`admin/video-file.ts`, они же повторяют серверный `video-upload.ts`):
 * mp4, webm или mov до 50 МБ и 90 секунд. Отказ здесь, а не после отправки:
 * файл едет в хранилище и раздаётся читателям.
 *
 * Длительность читает сам плеер превью (`loadedmetadata`) — второй probe рядом
 * с ним не нужен: он читал бы те же метаданные того же файла.
 */
export function ReelVideoSource({
  pick,
  error,
  onPick,
  onDuration,
}: {
  pick: ReelVideoPick | null;
  /** Почему ролик не взят: чужой формат, слишком большой, слишком длинный. */
  error: string | null;
  onPick: (file: File | null) => void;
  /** Длительность из метаданных превью: её проверяет вызывающая сторона. */
  onDuration: (seconds: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-text-1">
        <span className={fieldLabelClass()}>Видео (MP4, WebM или MOV)</span>
        <input
          type="file"
          accept="video/*"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onPick(event.target.files?.[0] ?? null);
            // Тот же файл можно выбрать заново (например, после «← Назад»).
            event.target.value = "";
          }}
          className={videoFieldClass}
        />
      </label>
      {pick && (
        <>
          <video
            src={pick.url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
            className="w-full rounded-2xl border border-glass-brd"
          />
          <p className="text-xs text-text-1">
            Видео взято: {pick.file.name} · {formatImageSize(pick.file.size)}
            {pick.durationSeconds !== null
              ? ` · ${formatVideoDuration(pick.durationSeconds)}`
              : ""}
          </p>
        </>
      )}
      {/* Отказ по ролику блокирует движение дальше, поэтому он `alert`, а не
          тихий `status`: человек обязан узнать, почему кнопка не срабатывает. */}
      {error && (
        <p role="alert" className="text-xs text-magenta">
          {error}
        </p>
      )}
      <p className="text-xs text-text-2">
        Ролик до {VIDEO_MAX_SECONDS} секунд и 50 МБ: mp4, webm или mov. Файл
        хранится как есть, без перекодирования — лучше всего играет mp4 (H.264).
        Подтвердите, что права на видео ваши: чужие ролики модерация отклоняет.
      </p>
    </div>
  );
}
