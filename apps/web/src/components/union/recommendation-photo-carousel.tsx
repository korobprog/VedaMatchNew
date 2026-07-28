"use client";

import type { UnionPhoto } from "@vedamatch/shared";
import { useState } from "react";

/**
 * `thumb` — компактное превью рядом с текстом, `cover` — фото на всю карточку
 * знакомства с индикаторами-сегментами сверху, как в профильных лентах.
 */
export type RecommendationPhotoCarouselVariant = "thumb" | "cover";

export function RecommendationPhotoCarousel({
  photos,
  userName,
  variant = "thumb",
}: {
  photos: UnionPhoto[];
  userName: string;
  variant?: RecommendationPhotoCarouselVariant;
}): React.ReactNode {
  const photoIdentity = photos.map(({ id, url }) => `${id}:${url}`).join("|");
  const identity = `${userName}|${photoIdentity}`;
  const [navigation, setNavigation] = useState({ identity, index: 0 });

  if (photos.length === 0) return null;

  const safeIndex =
    navigation.identity === identity
      ? Math.min(navigation.index, photos.length - 1)
      : 0;
  const photo = photos[safeIndex];
  const hasControls = photos.length > 1;
  const isCover = variant === "cover";

  return (
    <div
      className={
        isCover
          ? "absolute inset-0 h-full w-full overflow-hidden bg-bg-2"
          : "relative h-32 w-28 shrink-0 overflow-hidden rounded-xl bg-bg-2 sm:h-40 sm:w-36"
      }
      data-testid="recommendation-carousel"
    >
      {/* Signed gallery URLs can use varying storage hosts, so Next Image cannot
          safely enumerate their remote origins. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`${userName}, фото ${safeIndex + 1} из ${photos.length}`}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
      />

      {hasControls && (
        <>
          <button
            type="button"
            aria-label="Предыдущее фото"
            onClick={() =>
              setNavigation({
                identity,
                index: (safeIndex - 1 + photos.length) % photos.length,
              })
            }
            className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="Следующее фото"
            onClick={() =>
              setNavigation({ identity, index: (safeIndex + 1) % photos.length })
            }
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
          >
            <span aria-hidden="true">›</span>
          </button>
          <div
            className={
              isCover
                ? "absolute inset-x-2 top-2 flex gap-1"
                : "absolute inset-x-1 bottom-1 flex justify-center overflow-x-auto"
            }
            aria-label="Выбор фото"
          >
            {photos.map((item, photoIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Показать фото ${photoIndex + 1} из ${photos.length}`}
                aria-current={photoIndex === safeIndex ? "true" : undefined}
                onClick={() => setNavigation({ identity, index: photoIndex })}
                className={
                  isCover
                    ? "h-4 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
                    : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    isCover
                      ? `block h-1 w-full rounded-full shadow-sm ${
                          photoIndex === safeIndex ? "bg-white" : "bg-white/35"
                        }`
                      : `h-3 w-3 rounded-full border border-white shadow-sm ${
                          photoIndex === safeIndex ? "bg-white" : "bg-black/45"
                        }`
                  }
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
