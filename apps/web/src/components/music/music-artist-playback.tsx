"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicPlayAllButton } from "./player/play-all-button";
import { MusicPlayModeButtons } from "./player/play-mode-buttons";
import { MusicTrackRow } from "./music-track-row";
import { sortTracks, type TrackSortMode } from "./sort-tracks";

/**
 * Верхние кнопки «Слушать»/«Перемешать» и секция «Записи» на странице
 * исполнителя — одним компонентом, потому что состояние сортировки нужно
 * ОБЕИМ частям (VED-159, круг 2). Раньше сортировка жила только в секции
 * «Записи»: человек выбирал «По алфавиту», список ниже менялся, а «Слушать»
 * наверху всё равно запускало в исходном порядке с сервера — выглядело как
 * поломка. Теперь и «Слушать», и «Перемешать» ставят очередь в том же
 * порядке, который видно в списке; «Перемешать» перемешивает поверх этой
 * очереди — так же, как обычное перемешивание работает в остальном плеере
 * (`play-mode-buttons.tsx`), только множество записей теперь то, что видно.
 *
 * `children` — био и «Программы и альбомы»: по разметке эти серверные блоки
 * стоят между кнопками и секцией «Записи», сортировки не касаются, но
 * состояние нужно обеим соседним частям — сюда они передаются обычными
 * React-детьми клиентского компонента, а не переносятся в клиент сами.
 *
 * Сервер (`getArtist()`, `music-catalog.service.ts`) всегда отдаёт записи по
 * дате публикации, новые сверху, без параметра сортировки — сортировка
 * здесь клиентская, поверх уже загруженного списка, серверный API не
 * расширялся.
 */
export function MusicArtistPlayback({
  tracks,
  isMusicEditor,
  uploadHref,
  children,
}: {
  tracks: MusicTrackDto[];
  isMusicEditor: boolean;
  uploadHref: string;
  children?: React.ReactNode;
}) {
  // Выбор — в `useState`, не в `localStorage`: это не та же привычка, что
  // вид списка/сетки (VED-225) — сбрасывается при новом заходе на страницу.
  // По умолчанию — алфавит (VED-273): «по дате» человек выбирает сам кнопкой
  // ниже, и это выбор уважается до следующего захода на страницу.
  const [mode, setMode] = useState<TrackSortMode>("alpha");
  const [reverse, setReverse] = useState(false);

  const sorted = useMemo(
    () => sortTracks(tracks, mode, reverse),
    [tracks, mode, reverse],
  );
  // Одна очередь на всё: «Слушать» и «Перемешать» наверху, «дальше» в
  // плеере из строки списка — все идут по видимому порядку, а не по
  // исходному с сервера.
  const queue = useMemo(() => sorted.map((track) => track.id), [sorted]);

  return (
    <>
      {/* Кнопки порядка (VED-33): «Слушать» рядом — про «включи и не думай»,
          а эти про выбор: одна запись, весь список до конца, вперемешку. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <MusicPlayAllButton queue={queue} />
        <MusicPlayModeButtons queue={queue} />
        {isMusicEditor && (
          <Link
            href={uploadHref}
            className="btn-mint flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Загрузить треки
          </Link>
        )}
      </div>

      {children}

      <section className="mt-8" aria-labelledby="artist-tracks">
        <h2
          id="artist-tracks"
          className="font-display text-base font-bold text-text-0"
        >
          Записи
        </h2>
        {tracks.length === 0 ? (
          <p className="mt-3 text-sm text-text-1">
            Опубликованных записей пока нет.
          </p>
        ) : (
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
        )}
      </section>
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
