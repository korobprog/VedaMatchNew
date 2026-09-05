"use client";

import { useEffect, useRef } from "react";
import { formatTrackDuration } from "@/lib/music-duration";
import { useMusicPlayer } from "./player-provider";
import { useQueueTracks } from "./use-queue-tracks";

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
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const queue = player?.queue ?? [];
  const { tracks, missing } = useQueueTracks(queue);

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

  if (!player) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Очередь"
      // Ширина по месту, а не фиксированные 320 точек: панель висит у правого
      // края полосы, и на экране в 320 точек фиксированная ширина уезжала бы
      // за левый край вместе с названиями записей.
      className="glass pointer-events-auto absolute bottom-full right-0 mb-2 max-h-[60vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold text-text-0">Очередь</h2>
        {/* «Очистить» оставляет играющую запись: убрать её значит оборвать
            звук, а человек просил прибраться в списке. */}
        {queue.length > 1 && (
          <button
            type="button"
            onClick={player.clearQueue}
            className="ml-auto rounded-lg px-2 py-1 text-[11px] font-semibold text-text-2 hover:text-magenta"
          >
            Очистить
          </button>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть очередь"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
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
              <li key={`${id}-${at}`} className="group flex items-center">
                <button
                  type="button"
                  disabled={gone}
                  onClick={() => player.play(id, queue)}
                  aria-current={isCurrent ? "true" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-glass disabled:hover:bg-transparent ${
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

                {/* Играющую запись убрать нельзя — там кнопки просто нет,
                    а не заблокированная: объяснять «почему не нажимается»
                    в списке из десяти строк негде.

                    На телефоне крестик виден сразу: наведения там не
                    существует, и спрятанная под `group-hover` кнопка не
                    показалась бы никогда — очередь стала бы списком, из
                    которого нечем ничего убрать. */}
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => player.removeFromQueue(at)}
                    aria-label={`Убрать из очереди: ${track?.title ?? "запись"}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-2 transition-opacity hover:text-magenta focus-visible:opacity-100 motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
