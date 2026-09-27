"use client";

import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import {
  isShareDismissed,
  trackSharePath,
  trackShareScreenHref,
  trackShareText,
  type SharedTrack,
} from "./share-track";

/**
 * Кнопка «Поделиться» записью (VED-281): в полосе плеера и на странице
 * записи. Системное окно, а где его нет — портальный экран `/share`.
 * Переход — через роутер, а не `location`: полная загрузка страницы
 * остановила бы играющую запись.
 */
export function MusicShareTrackButton({
  track,
  className = "",
  size = "size-10",
}: {
  track: SharedTrack;
  className?: string;
  /** Размер круга; на странице записи — 44, как «Линия» рядом (VED-595). */
  size?: string;
}) {
  const router = useRouter();

  async function share() {
    const url = `${window.location.origin}${trackSharePath(track.id)}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: trackShareText(track), url });
        return;
      } catch (error) {
        if (isShareDismissed(error)) return;
      }
    }
    router.push(trackShareScreenHref(track));
  }

  return (
    <button
      type="button"
      aria-label={`Поделиться: ${track.title}`}
      title="Поделиться"
      onClick={() => void share()}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-text-1 transition-colors hover:text-text-0 ${className}`}
    >
      <Share2 aria-hidden className="size-4" />
    </button>
  );
}
