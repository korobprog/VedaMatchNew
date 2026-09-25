"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { MusicArtistDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { MusicArtistBubble } from "./music-artist-bubble";
import { MusicCover } from "./music-cover";

const VIEW_KEY = "vm.music.artistsView";

/**
 * Значок в строке «Исполнители» (VED-516): 40px, рамка — как у соседних
 * кнопок-чипов, но без подписи; имя кнопки — в `aria-label`.
 */
export const MUSIC_ICON_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-1 transition-colors hover:text-text-0";

/**
 * Исполнители кружками или списком, с переключателем — тот же приём, что у
 * записей (`music-track-list.tsx`), но свой ключ `localStorage`: человек
 * может держать записи «списком», а исполнителей — «плиткой», выбор не
 * должен зависеть друг от друга.
 *
 * Список нужен, когда исполнителей много: кружки читаются обложкой, которой
 * у большинства нет, а строка — именем и числом записей сразу.
 */
export function MusicArtistsSection({
  artists,
  toolbar,
  heading,
}: {
  artists: MusicArtistDto[];
  /**
   * Кнопки слева в ряду переключателя (VED-513): «Радио» и «Добавить
   * исполнителя». Ряд стоит над заголовком секции — кнопки выровнены в два
   * ряда с фильтрами выше, а «Списком» уходит к правому краю того же ряда.
   */
  toolbar?: ReactNode;
  /** Заголовок секции — под рядом кнопок. */
  heading?: ReactNode;
}) {
  const [list, setList] = useState(false);

  /* Читаем эффектом, а не ленивым `useState` — на сервере `localStorage`
     нет, расхождение гидратации не ловим. Тот же приём, что в
     `music-track-list.tsx`. */
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

  const choose = (next: boolean) => {
    setList(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next ? "list" : "grid");
    } catch {
      // см. выше
    }
  };

  return (
    <>
      {/* Одна строка (VED-516): заголовок слева, значки — «Фильтры»,
          «Добавить исполнителя», «Списком», «Плиткой» — напротив него.
          Отдельный ряд кнопок над заголовком съедал место, и кружки
          исполнителей уезжали вниз. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {heading}
        {toolbar}
        <button
          type="button"
          onClick={() => choose(true)}
          aria-pressed={list}
          aria-label="Списком"
          title="Списком"
          className={`${MUSIC_ICON_BUTTON} ${list ? "border-violet/50 bg-violet/12 text-text-0" : ""}`}
        >
          <ListIcon />
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          aria-pressed={!list}
          aria-label="Плиткой"
          title="Плиткой"
          className={`${MUSIC_ICON_BUTTON} ${!list ? "border-violet/50 bg-violet/12 text-text-0" : ""}`}
        >
          <GridIcon />
        </button>
      </div>

      {list ? (
        <ul className="mt-2 flex flex-col">
          {artists.map((artist) => (
            <li key={artist.id}>
              <MusicArtistRow artist={artist} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 grid max-w-lg grid-cols-4 justify-items-center gap-x-1 gap-y-4 pb-2 sm:gap-x-5">
          {artists.map((artist) => (
            <li key={artist.id}>
              <MusicArtistBubble artist={artist} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Исполнитель строкой: маленькая обложка, имя, число записей. Просто ссылка
 * на страницу исполнителя — не воспроизведение, исполнитель не «играет».
 */
function MusicArtistRow({ artist }: { artist: MusicArtistDto }) {
  return (
    <Link
      href={`/music/artists/${artist.slug}`}
      className="flex min-h-10 items-center gap-3 rounded-xl py-2 pl-2 pr-3 transition-colors hover:bg-glass"
    >
      {/* Тот же размер обложки, что в `MusicTrackRow` (`h-10 w-10`) — та же
          плотность строки у обоих списков на одной странице. */}
      <span className="size-10 shrink-0 overflow-hidden rounded-full">
        <MusicCover
          url={artist.coverUrl}
          seed={artist.id}
          alt={`Фото: ${artist.name}`}
          rounded="rounded-full"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-text-0">
          {artist.name}
        </span>
        <span className="font-mono text-xs text-text-2">
          {artist.trackCount}{" "}
          {plural(artist.trackCount, "запись", "записи", "записей")}
        </span>
      </span>
    </Link>
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
