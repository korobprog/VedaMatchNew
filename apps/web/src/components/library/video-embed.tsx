"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";

/**
 * Плеер стороннего видео на нашей странице.
 *
 * Пока не нажали «смотреть», показываем свою обложку и никаких запросов к
 * источнику не делаем: iframe подгружает трекеры сразу, а лента и страница
 * записи не должны отдавать читателя YouTube просто за факт открытия.
 */
export function VideoEmbed({
  locale,
  embedUrl,
  previewUrl,
  title,
}: {
  locale: LibraryLocale;
  embedUrl: string;
  previewUrl: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="mb-4 aspect-video w-full overflow-hidden rounded-2xl border border-glass-brd">
        <iframe
          src={`${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={t(locale, "entry.play")}
      className="group relative mb-4 block aspect-video w-full overflow-hidden rounded-2xl border border-glass-brd bg-bg-1"
    >
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3
        <img
          src={previewUrl}
          alt={t(locale, "entry.preview")}
          className="h-full w-full object-cover"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-bg-0/30 transition group-hover:bg-bg-0/10">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-0/80 text-text-0">
          <Play aria-hidden className="ml-1 h-7 w-7" />
        </span>
      </span>
    </button>
  );
}
