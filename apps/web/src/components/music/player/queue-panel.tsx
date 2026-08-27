"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import { getTrack } from "@/lib/music-playback-api";
import { formatTrackDuration } from "@/lib/music-duration";
import { useMusicPlayer } from "./player-provider";

/**
 * Очередь: что играет и что дальше.
 *
 * Карточки дочитываются по идентификаторам — очередь хранится списком id, а
 * не DTO, чтобы не таскать полсотни объектов в `localStorage` и в каждом
 * запросе. Дочитанное запоминается: переоткрытие панели не должно снова
 * ходить в сеть за тем же.
 *
 * Панель, а не страница: очередь смотрят, не отрываясь от того, что читают,
 * и уводить человека со страницы ради неё незачем.
 */
export function MusicQueuePanel({ onClose }: { onClose: () => void }) {
  const player = useMusicPlayer();
  const [tracks, setTracks] = useState<Record<string, MusicTrackDto>>({});
  /**
   * Записи, которых больше нет. Очередь переживает удаление из каталога —
   * без этой отметки строка висела бы вечным «…», и человек ждал бы
   * загрузки, которой не будет.
   */
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const queue = player?.queue ?? [];

  // Фокус переходит в панель: иначе Tab уводит по странице под ней, и
  // закрыть её с клавиатуры не получится.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const id of queue) {
        if (cancelled) return;
        // Уже дочитанное не запрашиваем второй раз.
        if (tracks[id]) continue;
        const track = await getTrack(id);
        if (cancelled) return;
        if (!track) {
          setMissing((was) => new Set(was).add(id));
          continue;
        }
        setTracks((was) => ({ ...was, [id]: track }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.join(",")]);

  if (!player) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Очередь"
      className="glass pointer-events-auto absolute bottom-full right-0 mb-2 max-h-[60vh] w-80 overflow-y-auto rounded-2xl p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-text-0">Очередь</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть очередь"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-2 hover:text-text-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-text-2">Очередь пуста.</p>
      ) : (
        <ol className="flex flex-col">
          {queue.map((id, at) => {
            const track = tracks[id];
            const gone = missing.has(id);
            const isCurrent = at === player.index;
            return (
              <li key={`${id}-${at}`}>
                <button
                  type="button"
                  disabled={gone}
                  onClick={() => player.play(id, queue)}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-glass disabled:hover:bg-transparent ${
                    isCurrent ? "text-text-0" : "text-text-1"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-5 shrink-0 text-right font-mono text-xs ${
                      isCurrent ? "text-violet" : "text-text-2"
                    }`}
                  >
                    {isCurrent ? "▶" : at + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate text-[13px] font-semibold ${gone ? "text-text-2" : ""}`}
                    >
                      {gone ? "Запись недоступна" : (track?.title ?? "…")}
                    </span>
                    <span className="truncate text-[11px] text-text-2">
                      {gone
                        ? "Её убрали из каталога"
                        : (track?.artist?.name ?? "")}
                    </span>
                  </span>
                  {track && (
                    <span className="shrink-0 font-mono text-[11px] text-text-2">
                      {formatTrackDuration(track.durationSeconds)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
