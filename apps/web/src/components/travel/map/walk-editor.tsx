"use client";

import { useState } from "react";
import {
  TRAVEL_MAP_STOP_PHOTOS_MAX,
  TRAVEL_MAP_STOP_STORY_MAX,
  TRAVEL_MAP_STOP_VIDEO_MAX_BYTES,
  TRAVEL_MAP_STOP_VIDEO_MIME_TYPES,
  type TravelMapRouteDto,
  type TravelMapRouteStopDto,
} from "@vedamatch/shared";
import {
  deleteTravelMapStopPhoto,
  deleteTravelMapStopVideo,
  updateTravelMapStopStory,
  uploadTravelMapStopPhoto,
  uploadTravelMapStopVideo,
} from "@/lib/travel-map-api";

const buttonClass =
  "min-h-11 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 disabled:opacity-60";
/* Скрытый input внутри подписи: кольцо фокуса рисуем на самой подписи. */
const fileLabel =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-magenta";
const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

interface WalkEditorProps {
  route: TravelMapRouteDto;
  onChange: (route: TravelMapRouteDto) => void;
}

/** Блок «Прогулка: рассказ и фото» для автора маршрута. */
export function WalkEditor({ route, onChange }: WalkEditorProps) {
  return (
    <section aria-label="Прогулка: рассказ и фото" className="mt-8">
      <h2 className="font-display text-xl text-text-0">
        Прогулка: рассказ и фото
      </h2>
      <p className="mt-1 text-sm text-text-1">
        Всё, что добавите к остановкам, гость увидит в режиме «Пройти маршрут».
      </p>
      <ol className="mt-3 space-y-3">
        {route.stops.map((stop, index) => (
          <StopEditor
            key={stop.id}
            routeId={route.id}
            stop={stop}
            index={index}
            onChange={onChange}
          />
        ))}
      </ol>
    </section>
  );
}

function StopEditor({
  routeId,
  stop,
  index,
  onChange,
}: {
  routeId: string;
  stop: TravelMapRouteStopDto;
  index: number;
  onChange: (route: TravelMapRouteDto) => void;
}) {
  const [story, setStory] = useState(stop.media.story);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(
    label: string,
    action: () => Promise<TravelMapRouteDto>,
    fallback: string,
  ) {
    setBusy(label);
    setError(null);
    setSaved(false);
    try {
      onChange(await action());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveStory() {
    const ok = await run(
      "story",
      () => updateTravelMapStopStory(routeId, stop.id, story.trim()),
      "Не получилось сохранить рассказ",
    );
    if (ok) setSaved(true);
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Это не картинка");
      return;
    }
    await run(
      "photo",
      () => uploadTravelMapStopPhoto(routeId, stop.id, file),
      "Не получилось загрузить фото",
    );
  }

  async function addVideo(file: File | undefined) {
    if (!file) return;
    if (
      !(TRAVEL_MAP_STOP_VIDEO_MIME_TYPES as readonly string[]).includes(
        file.type,
      )
    ) {
      setError("Подходят видео mp4, webm и mov");
      return;
    }
    if (file.size > TRAVEL_MAP_STOP_VIDEO_MAX_BYTES) {
      setError("Видео больше 60 МБ");
      return;
    }
    await run(
      "video",
      () => uploadTravelMapStopVideo(routeId, stop.id, file),
      "Не получилось загрузить видео",
    );
  }

  const photos = stop.media.photoUrls;
  const photosFull = photos.length >= TRAVEL_MAP_STOP_PHOTOS_MAX;
  const dirty = story.trim() !== stop.media.story;

  return (
    <li className="rounded-2xl border border-glass-brd bg-glass p-3">
      <h3 className="text-sm font-semibold text-text-0">
        {index + 1}. {stop.name}
      </h3>

      <label className="mt-2 block text-sm text-text-1">
        Рассказ
        <textarea
          value={story}
          onChange={(e) => {
            setStory(e.target.value);
            setSaved(false);
          }}
          maxLength={TRAVEL_MAP_STOP_STORY_MAX}
          rows={4}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveStory()}
          disabled={busy !== null || !dirty}
          className={buttonClass}
        >
          {busy === "story" ? "Сохраняем…" : "Сохранить рассказ"}
        </button>
        <span className="text-xs text-text-2">
          {story.length} / {TRAVEL_MAP_STOP_STORY_MAX}
        </span>
        {saved ? (
          <span role="status" className="text-xs text-text-1">
            Сохранено
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <p className="text-sm text-text-1">
          Фото: {photos.length} из {TRAVEL_MAP_STOP_PHOTOS_MAX}
        </p>
        {photos.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {photos.map((url, photoIndex) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Фото ${photoIndex + 1}, ${stop.name}`}
                  loading="lazy"
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  aria-label={`Удалить фото ${photoIndex + 1}: ${stop.name}`}
                  onClick={() =>
                    void run(
                      `photo-${photoIndex}`,
                      () => deleteTravelMapStopPhoto(routeId, stop.id, photoIndex),
                      "Не получилось удалить фото",
                    )
                  }
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-glass-brd bg-bg-1 text-xs text-text-0"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className={`${buttonClass} ${fileLabel} mt-2 inline-flex items-center`}>
          {busy === "photo" ? "Загружаем…" : "Добавить фото"}
          <input
            type="file"
            accept="image/*"
            disabled={busy !== null || photosFull}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void addPhoto(file);
            }}
            className="sr-only"
          />
        </label>
        {photosFull ? (
          <span className="ml-2 text-xs text-text-2">Больше фото нельзя</span>
        ) : null}
      </div>

      <div className="mt-3">
        <p className="text-sm text-text-1">Видео</p>
        {stop.media.videoUrl ? (
          <>
            <video
              src={stop.media.videoUrl}
              controls
              playsInline
              preload="metadata"
              className="mt-2 max-h-56 w-full rounded-xl bg-bg-1"
            />
            <button
              type="button"
              disabled={busy !== null}
              aria-label={`Удалить видео: ${stop.name}`}
              onClick={() =>
                void run(
                  "video-delete",
                  () => deleteTravelMapStopVideo(routeId, stop.id),
                  "Не получилось удалить видео",
                )
              }
              className={`${buttonClass} mt-2`}
            >
              Удалить видео
            </button>
          </>
        ) : (
          <>
            <label className={`${buttonClass} ${fileLabel} mt-1 inline-flex items-center`}>
              {busy === "video" ? "Загружаем…" : "Добавить видео"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void addVideo(file);
                }}
                className="sr-only"
              />
            </label>
            <p className="mt-1 text-xs text-text-2">до 1 минуты и 60 МБ</p>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-magenta">
          {error}
        </p>
      ) : null}
    </li>
  );
}
