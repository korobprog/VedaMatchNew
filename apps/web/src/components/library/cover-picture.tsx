"use client";

import { useCallback, useState } from "react";
import { coverFrameStyle, naturalRatio } from "./cover-frame";

/** Потолок высоты обложки в ленте: квадрат и вертикаль не займут весь экран. */
export const FEED_COVER_MAX_HEIGHT = "min(28rem, 70vh)";

/**
 * Обложка материала целиком и без полей (VED-138).
 *
 * Первый круг: картинку обрезали под 16:9 — у баннера катхи пропадали края с
 * надписью. Второй: вписали в ту же 16:9 целиком, поля заняла размытая копия,
 * — «дурацкие рамки». Теперь рамка сама принимает пропорции картинки и
 * тянется на всю ширину: баннер — полосой, квадрат — квадратом, вертикаль —
 * до потолка `maxHeight` и по центру. Расчёт — в cover-frame.ts.
 *
 * Пропорции узнаём по загрузке картинки. До того место держит 16:9, чтобы
 * лента не складывалась в ноль и не прыгала сильнее, чем нужно.
 *
 * Рамка (скругление, обводка) — здесь, а не у обёртки: у вертикальной
 * картинки рамка уже контейнера, и обводка обёртки очертила бы пустоту.
 */
export function CoverPicture({
  src,
  alt,
  lazy = false,
  maxHeight = FEED_COVER_MAX_HEIGHT,
  rounded = "rounded-xl",
}: {
  src: string;
  alt: string;
  lazy?: boolean;
  /** Потолок высоты рамки — любая CSS-длина. */
  maxHeight?: string;
  /** Класс скругления рамки: у страницы материала оно крупнее, чем в ленте. */
  rounded?: string;
}) {
  // Пропорции помним вместе с адресом: в форме картинку меняют, и старые
  // пропорции к новой картинке относиться не должны.
  const [measured, setMeasured] = useState<{ src: string; ratio: number } | null>(
    null,
  );
  const ratio = measured?.src === src ? measured.ratio : null;

  const measure = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete) return;
      const next = naturalRatio(img.naturalWidth, img.naturalHeight);
      if (next !== null) setMeasured({ src, ratio: next });
    },
    [src],
  );

  return (
    <span className="@container block w-full">
      <span
        data-cover-frame=""
        className={`mx-auto block overflow-hidden border border-glass-brd ${rounded} ${
          ratio === null ? "bg-bg-1" : ""
        }`}
        style={coverFrameStyle(ratio, maxHeight)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3 */}
        <img
          // Картинка, пришедшая до гидрации, `load` уже не пришлёт: её
          // пропорции снимаем при подключении узла.
          ref={measure}
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          onLoad={(event) => measure(event.currentTarget)}
          className="block h-full w-full object-contain"
        />
      </span>
    </span>
  );
}
