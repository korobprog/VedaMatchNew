"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Menu, Shuffle, X } from "lucide-react";
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
}: {
  isAdmin: boolean;
  /** Текущий порядок ленты: кнопка показывает, чем её сменить. */
  order?: "random";
  /** Сколько всего вдохновений в сервисе. */
  count?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link
        href="/"
        aria-label="Назад на портал"
        className="absolute left-3 top-3 z-50 flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="reels-sections"
        aria-label={open ? "Закрыть разделы" : "Разделы Вдохновения"}
        className="absolute right-3 top-3 z-50 flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open && (
        <div
          id="reels-sections"
          className="absolute right-3 top-16 z-50 w-60 rounded-2xl border border-white/15 bg-black/80 p-3 backdrop-blur-lg"
        >
          <MotivationNav active="feed" isAdmin={isAdmin} compact />

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
            href={order === "random" ? "/motivation" : "/motivation?order=random"}
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
