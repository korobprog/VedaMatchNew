"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import { MotivationNav } from "./motivation-nav";

/**
 * Кнопка «назад на портал» и меню разделов поверх полноэкранной ленты
 * рилсов. Раньше эту роль играли общий `Header` портала и `MotivationTopBar`,
 * занимавшие строку над лентой и сжимавшие сам рилс; здесь то же самое, но
 * прозрачным оверлеем поверх видео — рилс остаётся на весь экран, а меню не
 * видно, пока его не открыли.
 */
export function ReelsChrome({ isAdmin }: { isAdmin: boolean }) {
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
          <Link
            href="/motivation?view=list"
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
