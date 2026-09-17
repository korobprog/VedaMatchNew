"use client";

import { useMemo, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicTrackRow } from "./music-track-row";
import { sortTracks, type TrackSortMode } from "./sort-tracks";

/**
 * Секция «Записи» на странице исполнителя — с выбором сортировки (VED-159).
 *
 * Сервер (`getArtist()`, `music-catalog.service.ts`) всегда отдаёт записи по
 * дате публикации, новые сверху, без параметра сортировки — сортировка
 * здесь клиентская, поверх уже загруженного списка.
 *
 * Выбор — в `useState`, не в `localStorage`: это не та же привычка, что вид
 * списка/сетки (VED-225) — человек, выбравший «по алфавиту» у одного
 * исполнителя, не обязательно хочет того же у всех остальных при следующем
 * визите. Сбрасывается при новом заходе на страницу.
 */
export function MusicArtistTracks({ tracks }: { tracks: MusicTrackDto[] }) {
  const [mode, setMode] = useState<TrackSortMode>("date");
  const [reverse, setReverse] = useState(false);

  const sorted = useMemo(
    () => sortTracks(tracks, mode, reverse),
    [tracks, mode, reverse],
  );
  // Очередь строится из видимого порядка: кнопка «дальше» в плеере обязана
  // идти по тому, что человек видит на экране, а не по исходному порядку с
  // сервера — иначе список ниже и очередь плеера расходятся молча.
  const queue = useMemo(() => sorted.map((track) => track.id), [sorted]);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setMode("date")}
          aria-pressed={mode === "date"}
          className={`flex h-10 min-w-10 items-center rounded-xl border px-3 text-xs font-semibold transition-colors ${
            mode === "date"
              ? "border-cyan bg-cyan/10 text-text-0"
              : "border-glass-brd text-text-1 hover:text-text-0"
          }`}
        >
          По дате добавления
        </button>
        <button
          type="button"
          onClick={() => setMode("alpha")}
          aria-pressed={mode === "alpha"}
          className={`flex h-10 min-w-10 items-center rounded-xl border px-3 text-xs font-semibold transition-colors ${
            mode === "alpha"
              ? "border-cyan bg-cyan/10 text-text-0"
              : "border-glass-brd text-text-1 hover:text-text-0"
          }`}
        >
          По алфавиту
        </button>
        <button
          type="button"
          onClick={() => setReverse((was) => !was)}
          aria-pressed={reverse}
          aria-label={
            reverse ? "Обратный порядок включён" : "Обратный порядок"
          }
          title="Обратный порядок"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
            reverse
              ? "border-cyan bg-cyan/10 text-text-0"
              : "border-glass-brd text-text-1 hover:text-text-0"
          }`}
        >
          <ReverseIcon flipped={reverse} />
        </button>
      </div>

      <ul className="mt-2 flex flex-col">
        {sorted.map((track) => (
          <li key={track.id}>
            <MusicTrackRow track={track} queue={queue} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ReverseIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${flipped ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
