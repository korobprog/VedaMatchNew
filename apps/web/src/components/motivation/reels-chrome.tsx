"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Menu, Shuffle, X } from "lucide-react";
import { reelsHref, type ReelsTab } from "./feed-style";
import { MotivationNav } from "./motivation-nav";

/**
 * Кнопка «назад на портал» и меню разделов поверх полноэкранной ленты
 * рилсов. Раньше эту роль играли общий `Header` портала и `MotivationTopBar`,
 * занимавшие строку над лентой и сжимавшие сам рилс; здесь то же самое, но
 * прозрачным оверлеем поверх видео — рилс остаётся на весь экран, а меню не
 * видно, пока его не открыли.
 */
export function ReelsChrome({
  isAdmin,
  order,
  count,
  tab = "forYou",
}: {
  isAdmin: boolean;
  /** Вкладка: «Вперемешку» в открытках перемешивает открытки (VED-121). */
  tab?: ReelsTab;
  /** Текущий порядок ленты: кнопка показывает, чем её сменить. */
  order?: "random";
  /** Сколько всего вдохновений в сервисе. */
  count?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* VED-252: без кружка-подложки — кнопка часть фона кадра, читаемость
          держит тот же drop-shadow, что у текста вкладок (Tabs() ниже).
          Видимая иконка мельче (size-4), но кликабельная область — весь
          size-10 (40×40) в невидимом hit-area, ширины ряда вкладок это не
          трогает: кнопки стоят абсолютно, вне общего flex-потока. */}
      <Link
        href="/"
        aria-label="Назад на портал"
        className="absolute left-2 top-2 z-50 flex size-10 items-center justify-center text-white drop-shadow transition hover:opacity-80"
      >
        <ArrowLeft className="size-4" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="reels-sections"
        aria-label={open ? "Закрыть разделы" : "Разделы Вдохновения"}
        className="absolute right-2 top-2 z-50 flex size-10 items-center justify-center text-white drop-shadow transition hover:opacity-80"
      >
        {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
      </button>

      {open && (
        <div
          id="reels-sections"
          className="absolute right-2 top-14 z-50 w-60 rounded-2xl border border-white/15 bg-black/80 p-3 backdrop-blur-lg"
        >
          <MotivationNav active="feed" isAdmin={isAdmin} compact reelsMenu />

          {/* Полноэкранная лента шапки не показывает, а число «а много ли тут
              вообще» спрашивают именно здесь — в единственном месте, где
              видно название сервиса. */}
          {count !== undefined && count > 0 && (
            <p className="mt-2 text-center font-mono text-xs text-white/60">
              {count} вдохновений в сервисе
            </p>
          )}

          {/* Перемешать. Ссылкой, а не переключателем в настройках: порядок
              ленты выбирают на месте и на один заход, а не однажды и надолго.
              Ведёт на тот же адрес с другим параметром — лента перезапустится
              с новым семенем перемешивания. */}
          <Link
            href={reelsHref({
              tab: tab === "cards" ? "cards" : "forYou",
              order: order === "random" ? undefined : "random",
            })}
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-center text-xs font-medium text-white/80 transition hover:text-white"
          >
            <Shuffle className="size-3.5" aria-hidden />
            {order === "random" ? "По порядку" : "Вперемешку"}
          </Link>

          <Link
            href={order === "random" ? "/motivation?view=list&order=random" : "/motivation?view=list"}
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-full border border-white/20 px-3 py-1.5 text-center text-xs font-medium text-white/80 transition hover:text-white"
          >
            Список
          </Link>
        </div>
      )}
    </>
  );
}
