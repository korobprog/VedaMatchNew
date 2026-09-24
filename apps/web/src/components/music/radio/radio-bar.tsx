"use client";

import { Radio, Square } from "lucide-react";
import { MusicCover } from "../music-cover";
import { useMusicRadio } from "./radio-provider";
import { radioItemTitle, radioListenersLabel } from "./radio-sync";

/**
 * Полоса эфира (VED-437) — на месте полосы плеера Медиатеки, пока играет
 * радио: у эфира нет перемотки и очереди, поэтому и полоса проще — что
 * звучит, сколько слушают и «Выключить».
 *
 * `data-music-radio` — зацепка для отступа страницы снизу в globals.css,
 * как у полосы плеера.
 */
export function MusicRadioBar() {
  const radio = useMusicRadio();
  if (!radio?.active) return null;
  const { item, listeners, loading, error } = radio;
  const title = item
    ? radioItemTitle(item)
    : loading
      ? "Подключаемся к эфиру…"
      : "Эфир";

  return (
    <div
      data-music-radio=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 sm:px-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <section
        aria-label="Радио VM"
        className="pointer-events-auto mx-auto bg-bg-1 shadow-lg flex max-w-3xl items-center gap-3 rounded-t-2xl border border-glass-brd px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-2.5"
      >
        <span className="relative size-11 shrink-0 overflow-hidden rounded-xl">
          {item?.track ? (
            <MusicCover
              url={item.track.coverUrl}
              seed={item.track.id}
              alt=""
              rounded="rounded-xl"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-magenta/15 text-magenta">
              <Radio aria-hidden className="size-5" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-magenta">
            <span
              aria-hidden
              className="size-2 rounded-full bg-magenta motion-safe:animate-pulse"
            />
            Радио VM
            {listeners !== null && (
              <span className="font-normal text-text-2">
                · {radioListenersLabel(listeners)}
              </span>
            )}
          </span>
          <span className="truncate text-sm text-text-0" aria-live="polite">
            {error ?? title}
          </span>
        </span>
        <button
          type="button"
          onClick={radio.stop}
          aria-label="Выключить радио"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-1 hover:text-text-0"
        >
          <Square aria-hidden className="size-4" fill="currentColor" />
        </button>
      </section>
    </div>
  );
}
