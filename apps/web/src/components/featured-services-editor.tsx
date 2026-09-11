"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import {
  HOME_FEATURED_COOKIE,
  HOME_FEATURED_COOKIE_MAX_AGE,
  assignHomeFeaturedSlot,
  serializeHomeFeatured,
} from "@/lib/home-featured";

const SLOT_LABELS = ["Первая кнопка", "Вторая кнопка", "Третья кнопка"];

/**
 * Настройка трёх кнопок над сеткой (VED-86).
 *
 * Выбор пишется в cookie и главная перерисовывается на сервере: сетка ниже
 * отсеивает кнопки ещё там, и после сохранения сервис, снятый с кнопки,
 * возвращается в сетку, а поставленный — из неё уходит.
 */
export function FeaturedServicesEditor({
  userId,
  current,
  options,
}: {
  userId: string;
  current: string[];
  options: { key: string; name: string }[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [slots, setSlots] = useState(current);
  const [pending, startTransition] = useTransition();

  // Выбирать не из чего — кнопка настройки была бы обещанием без дела.
  if (options.length <= current.length) return null;

  function open() {
    // Отменённая правка не должна всплывать при следующем открытии.
    setSlots(current);
    dialogRef.current?.showModal();
  }

  function apply(value: string, maxAge: number) {
    document.cookie = `${HOME_FEATURED_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
    dialogRef.current?.close();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-2 hover:text-text-0 disabled:opacity-50"
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
          {pending ? "Сохраняем…" : "Настроить кнопки"}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="featured-editor-title"
        className="m-auto w-[min(92vw,26rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply(
              serializeHomeFeatured(userId, slots),
              HOME_FEATURED_COOKIE_MAX_AGE,
            );
          }}
          className="p-6 text-left"
        >
          <h2
            id="featured-editor-title"
            className="font-display text-lg font-bold"
          >
            Кнопки на главной
          </h2>
          <p className="mt-2 text-sm text-text-1">
            Три сервиса, за которыми вы заходите чаще всего. Остальные
            останутся в списке ниже.
          </p>

          <div className="mt-4 space-y-3">
            {slots.map((key, index) => (
              <label key={index} className="block text-sm text-text-1">
                {SLOT_LABELS[index] ?? `Кнопка ${index + 1}`}
                <select
                  value={key}
                  onChange={(event) =>
                    setSlots((prev) =>
                      assignHomeFeaturedSlot(prev, index, event.target.value),
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
                >
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              className="btn-mint flex-1 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1"
            >
              Отмена
            </button>
          </div>
          {/* Пустое значение с нулевым сроком стирает cookie: дальше
              главная снова показывает кнопки по умолчанию. */}
          <button
            type="button"
            onClick={() => apply("", 0)}
            className="mt-3 min-h-8 w-full text-center text-xs font-medium text-text-2 underline-offset-2 hover:text-text-0 hover:underline"
          >
            Вернуть кнопки по умолчанию
          </button>
        </form>
      </dialog>
    </>
  );
}
