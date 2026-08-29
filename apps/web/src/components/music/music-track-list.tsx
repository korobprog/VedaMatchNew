"use client";

import { useEffect, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicTrackCard } from "./music-track-card";
import { MusicTrackRow } from "./music-track-row";

const VIEW_KEY = "vm.music.view";

/**
 * Записи каталога сеткой или списком, с переключателем.
 *
 * Плитки на телефоне занимают полэкрана каждая: четыре записи — и уже нужна
 * прокрутка. Список показывает вдвое больше и читается названием, а не
 * обложкой, которой у большинства записей всё равно нет — вместо неё
 * нарисованный градиент, и различать записи по нему невозможно.
 *
 * Одна кнопка, а не две: режима всего два, и вторая кнопка была бы всегда
 * нажатой копией первой.
 *
 * Выбор живёт в `localStorage`, а не в адресе: это не то, что пересылают
 * вместе со ссылкой, а привычка человека — и она обязана пережить переход на
 * страницу записи и обратно. Списки на других страницах Музыки строчные
 * всегда, так что переключателю там нечего переключать.
 */
export function MusicTrackList({ tracks }: { tracks: MusicTrackDto[] }) {
  const [list, setList] = useState(false);

  /* Читаем эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
     инициализатор вернул бы «сетка», а на клиенте — «список», и это
     расхождение гидратации. Тем же способом читает своё значение
     `mini-player.tsx`. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий
       выше: ленивый useState здесь даёт расхождение гидратации. */
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "list") setList(true);
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggle = () => {
    setList((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(VIEW_KEY, next ? "list" : "grid");
      } catch {
        // см. выше
      }
      return next;
    });
  };

  const queue = tracks.map((item) => item.id);

  return (
    <>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={list}
          className="flex h-9 items-center gap-2 rounded-xl border border-glass-brd px-3 text-xs font-semibold text-text-1 transition-colors hover:text-text-0"
        >
          {list ? <GridIcon /> : <ListIcon />}
          {list ? "Плитками" : "Списком"}
        </button>
      </div>

      {list ? (
        <ul className="mt-2 flex flex-col">
          {tracks.map((track) => (
            <li key={track.id}>
              <MusicTrackRow track={track} queue={queue} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {tracks.map((track) => (
            <li key={track.id}>
              <MusicTrackCard track={track} queue={queue} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "size-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
