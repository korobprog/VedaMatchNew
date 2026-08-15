"use client";

import { useState } from "react";
import type { MarketListingImageDto } from "@vedamatch/shared";

/** Галерея объявления: крупный кадр плюс превью. Без карусели и свайпов —
 *  восьми фотографий хватает, чтобы обойтись обычными кнопками. */
export function ListingGallery({
  images,
  alt,
}: {
  images: MarketListingImageDto[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-glass-brd bg-bg-1 text-text-2">
        <span className="font-display text-5xl opacity-30">
          {alt.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3 */}
      <img
        src={current.url}
        alt={alt}
        className="aspect-square w-full rounded-2xl border border-glass-brd object-cover"
      />
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-current={index === active ? "true" : undefined}
              className={[
                "h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-opacity",
                index === active
                  ? "border-magenta"
                  : "border-glass-brd opacity-70 hover:opacity-100",
              ].join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3 */}
              <img
                src={image.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
