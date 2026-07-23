"use client";

import type { UnionPhoto } from "@vedamatch/shared";
import { useState } from "react";

export function RecommendationPhotoCarousel({
  photos,
  userName,
}: {
  photos: UnionPhoto[];
  userName: string;
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

  return (
    <div
      className="relative h-32 w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:h-40 sm:w-36 dark:bg-zinc-800"
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
            className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="Следующее фото"
            onClick={() =>
              setNavigation({ identity, index: (safeIndex + 1) % photos.length })
            }
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            <span aria-hidden="true">›</span>
          </button>
          <div
            className="absolute inset-x-1 bottom-1 flex justify-center overflow-x-auto"
            aria-label="Выбор фото"
          >
            {photos.map((item, photoIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Показать фото ${photoIndex + 1} из ${photos.length}`}
                aria-current={photoIndex === safeIndex ? "true" : undefined}
                onClick={() => setNavigation({ identity, index: photoIndex })}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                <span
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full border border-white shadow-sm ${
                    photoIndex === safeIndex ? "bg-white" : "bg-black/45"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
