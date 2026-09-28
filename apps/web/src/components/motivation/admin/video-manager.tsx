"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type {
  MotivationCategoryDto,
  MotivationVideoDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { apiRequest } from "../motivation-admin-api";
import { reelsHref } from "../feed-style";
import { CategorySelect } from "./category-select";
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./ui";
import {
  VIDEO_ACCEPT,
  VIDEO_MAX_SECONDS,
  formatVideoDuration,
  videoDurationProblem,
  videoFileProblem,
} from "./video-file";

const API_URL = apiBase();

/**
 * Длительность из метаданных ролика — браузер читает её без загрузки всего
 * файла. Сервер у mp4/mov берёт свою, а у WebM верит этой. `NaN` — не смог.
 */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(Number.NaN);
    probe.src = url;
  });
}

/**
 * Короткие видео для ленты «Видео» (VED-246). Как готовые картинки: файл и
 * категория — и ролик сразу в ленте, без очереди. Категории — все из
 * справочника афоризмов.
 */
export function VideoManager({
  categories,
  initial,
}: {
  categories: MotivationCategoryDto[];
  initial: MotivationVideoDto[];
}) {
  const [items, setItems] = useState(initial);
  const [category, setCategory] = useState(
    () =>
      categories.find((item) => item.isDefault)?.slug ??
      categories[0]?.slug ??
      "",
  );
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setError(null);
    const fileProblem = videoFileProblem(file);
    if (fileProblem) return setError(fileProblem);
    setBusy(true);
    try {
      const duration = await readDuration(file);
      const durationProblem = videoDurationProblem(duration);
      if (durationProblem) return setError(durationProblem);
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      if (title.trim()) form.append("title", title.trim());
      if (Number.isFinite(duration))
        form.append("durationSeconds", String(duration));
      const response = await apiFetch(`${API_URL}/admin/motivation/videos`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await errorText(response));
      const saved = (await response.json()) as MotivationVideoDto;
      setItems((current) => [saved, ...current]);
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Не удалось загрузить видео",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(video: MotivationVideoDto) {
    if (
      !window.confirm(`Удалить видео${video.title ? ` «${video.title}»` : ""}?`)
    )
      return;
    setError(null);
    try {
      await apiRequest(`/admin/motivation/videos/${video.id}`, "DELETE");
      setItems((current) => current.filter((item) => item.id !== video.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вышло удалить");
    }
  }

  return (
    <section className="space-y-4">
      <div className={cardClass}>
        <h2 className="font-display text-lg font-semibold text-text-0">
          Загрузить видео
        </h2>
        <p className="mt-1 text-sm text-text-1">
          Короткие ролики до {VIDEO_MAX_SECONDS} секунд и 50 МБ: mp4, webm или
          mov. Публикуются сразу во вкладку «Видео» выбранной категории. Файл
          хранится как есть, без перекодирования, — лучше всего играет mp4
          (H.264).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CategorySelect
            categories={categories}
            value={category}
            disabled={busy}
            onChange={setCategory}
          />
          <label className={labelClass}>
            <span>Подпись (необязательно)</span>
            <input
              value={title}
              maxLength={160}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className={`mt-2 ${fieldClass}`}
            />
          </label>
        </div>
        <label className={`mt-4 ${labelClass}`}>
          <span>Файл</span>
          <input
            ref={fileRef}
            type="file"
            accept={VIDEO_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              setError(null);
              setFile(event.target.files?.[0] ?? null);
            }}
            className={`mt-2 ${fieldClass}`}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void upload()}
            disabled={busy || !file || !category}
            className={primaryButton}
          >
            {busy ? "Загружаем…" : "Опубликовать"}
          </button>
          <Link href={reelsHref({ tab: "video" })} className={secondaryButton}>
            Открыть ленту «Видео»
          </Link>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-magenta">
            {error}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-2">Пока ни одного видео.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((video) => (
            <li
              key={video.id}
              className="rounded-xl border border-glass-brd bg-bg-1 p-3"
            >
              {/* Посмотреть прямо здесь: что за файл, проверяют до ленты. */}
              <video
                src={video.url}
                controls
                preload="metadata"
                playsInline
                className="aspect-[9/16] max-h-80 w-full rounded-lg bg-bg-2 object-contain"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-0">
                    {video.title || "Без подписи"}
                  </span>
                  <span className="block text-xs text-text-2">
                    {video.categoryTitle || video.category} ·{" "}
                    <span className="font-mono">
                      {formatVideoDuration(video.durationSeconds)}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(video)}
                  className="min-h-11 rounded-lg border border-glass-brd px-3 text-xs text-text-2 hover:text-magenta"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Сервер отвечает JSON `{ message }` — показываем текст, а не сырой JSON. */
async function errorText(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // не JSON — отдаём как есть
  }
  return raw || `Ошибка ${response.status}`;
}
