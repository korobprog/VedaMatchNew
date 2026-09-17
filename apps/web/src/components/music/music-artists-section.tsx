"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MusicArtistDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { MusicArtistBubble } from "./music-artist-bubble";
import { MusicCover } from "./music-cover";

const VIEW_KEY = "vm.music.artistsView";

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
}: {
  artists: MusicArtistDto[];
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

  return (
    <>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={list}
          className="flex h-10 min-w-10 items-center gap-2 rounded-xl border border-glass-brd px-3 text-xs font-semibold text-text-1 transition-colors hover:text-text-0"
        >
          {list ? <GridIcon /> : <ListIcon />}
          {list ? "Плиткой" : "Списком"}
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
      className="flex min-h-10 items-center gap-3 rounded-xl py-1.5 pl-2 pr-3 transition-colors hover:bg-glass"
    >
      <span className="size-9 shrink-0 overflow-hidden rounded-full">
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
