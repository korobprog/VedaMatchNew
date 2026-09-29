"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle, X } from "lucide-react";
import type { TourChapter } from "@/lib/tour";
import { TourVideoPlayer } from "./tour-video";

/**
 * Значок «?» рядом с названием сервиса (VED-651): открывает окно с
 * видео-презентацией этой главы тура и ссылкой на весь туториал. Видео
 * монтируется только в открытом окне — закрыл окно, звук замолчал.
 */
export function TourVideoHelp({ chapter }: { chapter: TourChapter }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const label = `Видео: ${chapter.title} — как это устроено`;

  function show() {
    setOpen(true);
    dialogRef.current?.showModal?.();
  }

  function close() {
    dialogRef.current?.close?.();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={label}
        title={label}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-glass-brd text-text-1 transition-colors hover:border-cyan/60 hover:text-text-0"
      >
        <HelpCircle aria-hidden className="size-6" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={label}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Нажатие на затемнение вокруг окна закрывает его.
          if (event.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(960px,calc(100vw-32px))] max-w-none rounded-3xl border border-glass-brd bg-bg-1 p-0 text-text-0 backdrop:bg-black/70"
      >
        {open && (
          <div className="flex flex-col gap-4 p-4 text-left sm:p-6">
            <div className="flex items-center gap-3">
              <h2 className="flex-grow font-display text-lg font-bold">
                {chapter.title}: видео-презентация
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="inline-flex size-11 items-center justify-center rounded-xl border border-glass-brd text-text-1 hover:text-text-0"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <TourVideoPlayer
              video={chapter.video}
              title={chapter.title}
              autoPlay
            />
            <Link
              href={`/tour#${chapter.id}`}
              className="self-start text-sm font-semibold text-cyan"
            >
              Весь туториал о портале →
            </Link>
          </div>
        )}
      </dialog>
    </>
  );
}
