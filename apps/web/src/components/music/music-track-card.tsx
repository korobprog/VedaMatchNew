import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "./music-cover";
import { MusicPlayButton } from "./player/play-button";

/**
 * Карточка записи в сетке каталога.
 *
 * Кнопка воспроизведения нарисована, но пока не нажимается: плеер приезжает
 * этапом 3. Рисуем её сразу, а не добавляем потом, потому что от неё зависит
 * вся раскладка плитки — вставить её позже значит переверстать сетку.
 */
export function MusicTrackCard({
  track,
  queue,
}: {
  track: MusicTrackDto;
  /** Записи секции: «дальше» ведёт по тому, что человек видит на экране. */
  queue?: string[];
}) {
  const meta = [track.artist?.name, formatTrackDuration(track.durationSeconds)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="group relative flex min-w-0 flex-col gap-2.5">
      {/* Обложка кликается мышью, но для скринридера скрыта: она ведёт туда
          же, куда название, и вторая ссылка на ту же запись — лишний узел в
          обходе. Без этого она объявлялась как безымянная «ссылка», а там,
          где есть значок, — как «С программы».
          Кнопка запуска вынесена из ссылки: внутри скрытого от читалки узла
          она бы тоже пропала, а это главное действие карточки. */}
      <Link
        href={`/music/tracks/${track.id}`}
        aria-hidden="true"
        tabIndex={-1}
        className="relative aspect-square overflow-hidden rounded-2xl"
      >
        <MusicCover
          url={track.coverUrl}
          seed={track.id}
          alt={`Обложка: ${track.title}`}
        />
      </Link>

      <MusicPlayButton trackId={track.id} title={track.title} queue={queue} />

      {/* Значок вынесен из ссылки: внутри скрытой от скринридера обложки он
          пропал бы, а «запись с программы» — сведения, а не украшение. */}
      {track.isLiveRecording && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-glass-brd bg-bg-0/70 px-2 py-0.5 text-[11px] font-semibold text-text-1">
          С программы
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/music/tracks/${track.id}`}
          className="truncate py-0.5 text-sm font-semibold text-text-0 hover:text-cyan"
        >
          {track.title}
        </Link>
        <span className="truncate text-xs text-text-2">{meta}</span>
      </div>
    </article>
  );
}
