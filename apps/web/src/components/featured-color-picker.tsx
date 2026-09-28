"use client";

import { useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { HOME_FEATURED_COOKIE_MAX_AGE } from "@/lib/home-featured";
import {
  FEATURED_ACCENT_FILL,
  FEATURED_ACCENT_NAMES,
  FEATURED_PALETTE,
  HOME_FEATURED_COLORS_COOKIE,
  assignFeaturedAccent,
  serializeFeaturedColors,
  type FeaturedAccent,
} from "./featured-accents";

/** Вне компонента: запись в `document` из тела обработчика линтер хуков
 * принимает за мутацию внешнего значения. */
function saveColors(userId: string, accents: readonly FeaturedAccent[]) {
  const value = serializeFeaturedColors(userId, accents);
  document.cookie = `${HOME_FEATURED_COLORS_COOKIE}=${value}; path=/; max-age=${HOME_FEATURED_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Кружок цвета в правом верхнем углу главной кнопки (VED-452): «кнопку смены
 * цвета прямо на этих трёх клавишах».
 *
 * Стоит рядом со ссылкой сервиса, а не внутри неё: кнопка внутри `<a>` —
 * невалидная разметка, и нажатие на кружок уводило бы в сервис. Видимый
 * кружок маленький, а цель нажатия — 32px, чтобы попадать пальцем.
 *
 * Выбор пишется в cookie и главная перерисовывается на сервере — так же, как
 * выбор самих кнопок в `FeaturedServicesEditor`.
 */
export function FeaturedColorPicker({
  userId,
  serviceName,
  index,
  accents,
}: {
  userId: string;
  serviceName: string;
  /** Место кнопки в ряду. */
  index: number;
  /** Текущие цвета всех трёх кнопок: выбранный у соседа — меняются. */
  accents: FeaturedAccent[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const current = accents[index];

  function choose(accent: FeaturedAccent) {
    const next = assignFeaturedAccent(accents, index, accent);
    saveColors(userId, next);
    dialogRef.current?.close();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={pending}
        aria-label={`Цвет кнопки: ${FEATURED_ACCENT_NAMES[current]}`}
        title={`Цвет кнопки «${serviceName}»`}
        className="absolute right-1 top-1 z-10 flex size-8 items-center justify-center rounded-full disabled:opacity-50"
      >
        <span
          aria-hidden
          className={`block size-3 rounded-full ring-1 ring-glass-brd ${FEATURED_ACCENT_FILL[current]}`}
        />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,22rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
      >
        <div className="p-6 text-left">
          <h2 id={titleId} className="font-display text-lg font-bold">
            Цвет кнопки «{serviceName}»
          </h2>
          <p className="mt-2 text-sm text-text-1">
            Если цвет уже у другой кнопки, они поменяются цветами.
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {FEATURED_PALETTE.map((accent) => {
              const selected = accent === current;
              return (
                <li key={accent}>
                  <button
                    type="button"
                    onClick={() => choose(accent)}
                    aria-pressed={selected}
                    className={`flex w-full flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium text-text-1 hover:text-text-0 ${
                      selected ? "border-text-2" : "border-glass-brd"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-7 items-center justify-center rounded-full ${FEATURED_ACCENT_FILL[accent]}`}
                    >
                      {selected && <Check className="size-4 text-bg-0" />}
                    </span>
                    {FEATURED_ACCENT_NAMES[accent]}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="mt-4 w-full rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1"
          >
            Отмена
          </button>
        </div>
      </dialog>
    </>
  );
}
