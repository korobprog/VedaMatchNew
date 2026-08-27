import Link from "next/link";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";
import { MusicCover } from "./music-cover";

/**
 * Запись строкой — для списков внутри альбома, исполнителя и очереди.
 * Сетка плитками хороша для витрины, но программу на два десятка киртанов
 * ей не показать: там важен порядок, а не обложки.
 */
export function MusicTrackRow({
  track,
  position,
}: {
  track: MusicTrackDto;
  /** Номер в программе. Без него порядок записи читается как случайный. */
  position?: number;
}) {
  return (
    <Link
      href={`/music/tracks/${track.id}`}
      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-glass"
    >
      {position !== undefined && (
        <span className="w-6 shrink-0 text-right font-mono text-xs text-text-2">
          {position}
        </span>
      )}
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <MusicCover
          url={track.coverUrl}
          seed={track.id}
          alt={`Обложка: ${track.title}`}
          rounded="rounded-lg"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-text-0">
          {track.title}
        </span>
        <span className="truncate text-xs text-text-2">
          {track.artist?.name ?? "Исполнитель не указан"}
        </span>
      </span>
      <span className="ml-auto shrink-0 font-mono text-xs text-text-2">
        {formatTrackDuration(track.durationSeconds)}
      </span>
    </Link>
  );
}
