"use client";

import { useSyncExternalStore } from "react";
import { Clapperboard } from "lucide-react";
import { TOUR_MOBILE_QUERY, pickTourVideo, type TourVideo } from "@/lib/tour";
import { cn } from "@/lib/utils";

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia?.(TOUR_MOBILE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/**
 * Видео-презентация (VED-651): вертикальная версия на телефоне,
 * горизонтальная на компьютере (`pickTourVideo`). До гидрации —
 * компьютерная: сервер экрана не знает. Нет адресов — «Видео готовится».
 * Живёт в туре `/tour` и в окне «?» на странице сервиса.
 */
export function TourVideoPlayer({
  video,
  title,
  onEnded,
  autoPlay = false,
}: {
  video: TourVideo;
  title: string;
  onEnded?: () => void;
  autoPlay?: boolean;
}) {
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia?.(TOUR_MOBILE_QUERY).matches ?? false,
    () => false,
  );
  const picked = pickTourVideo(video, mobile);

  if (!picked) {
    return (
      <div className="glass flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-glass-brd text-center">
        <Clapperboard aria-hidden className="size-10 text-text-2" />
        <p className="font-semibold text-text-0">Видео готовится</p>
        <p className="max-w-sm px-4 text-sm text-text-1">
          Презентация скоро появится здесь.
        </p>
      </div>
    );
  }
  return (
    <video
      key={picked.url}
      src={picked.url}
      poster={picked.poster ?? undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      onEnded={onEnded}
      aria-label={`Видео-презентация: ${title}`}
      className={cn(
        "rounded-3xl bg-bg-2",
        picked.vertical
          ? "mx-auto aspect-[9/16] max-h-[75dvh] max-w-full"
          : "aspect-video w-full",
      )}
    />
  );
}
