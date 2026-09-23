"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { LibraryLocale, LibraryShlokaImageDto } from "@vedamatch/shared";
import { st } from "./shloka-text";

/**
 * Иллюстрации шлоки: сетка миниатюр, по нажатию — крупно в `<dialog>`.
 * Нативный диалог сам держит фокус внутри, закрывается по Escape и
 * возвращает фокус на миниатюру, с которой его открыли.
 */
export function ShlokaImages({
  locale,
  images,
  label,
}: {
  locale: LibraryLocale;
  images: LibraryShlokaImageDto[];
  /** Подпись для alt: «Иллюстрация к шлоке 2.13, 1 из 3». */
  label: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open !== null && !dialog.open) dialog.showModal();
    if (open === null && dialog.open) dialog.close();
  }, [open]);

  if (images.length === 0) return null;
  const alt = (index: number) =>
    `${label}, ${index + 1} / ${images.length}`;
  const current = open !== null ? images[open] : null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image, index) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={`${st(locale, "view.imageOpen")}: ${alt(index)}`}
              className="block w-full overflow-hidden rounded-2xl border border-glass-brd bg-bg-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- картинка из своего S3, размеры известны */}
              <img
                src={image.url}
                alt=""
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                loading="lazy"
                className="aspect-square h-auto w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        onClick={(event) => {
          // Нажатие на затемнение вокруг картинки закрывает просмотр.
          if (event.target === event.currentTarget) setOpen(null);
        }}
        aria-label={current ? alt(open ?? 0) : undefined}
        className="m-auto max-h-[92dvh] max-w-[min(96vw,1100px)] rounded-2xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-bg-0/80"
      >
        {current && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={st(locale, "view.imageClose")}
              className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-0/85 text-text-0 shadow"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- см. выше */}
            <img
              src={current.url}
              alt={alt(open ?? 0)}
              width={current.width ?? undefined}
              height={current.height ?? undefined}
              className="block max-h-[92dvh] w-auto max-w-full object-contain"
            />
          </div>
        )}
      </dialog>
    </>
  );
}
