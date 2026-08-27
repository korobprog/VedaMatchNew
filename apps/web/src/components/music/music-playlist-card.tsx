import type { MusicPlaylistCardDto } from "@vedamatch/shared";
import { formatTotalDuration } from "@/lib/music-duration";
import { plural } from "@/lib/plural";
import { MusicCover } from "./music-cover";

/**
 * Плитка подборки редакции. Пока не ссылка: страницы плейлиста нет до
 * этапа 4, а ссылка в никуда хуже её отсутствия.
 */
export function MusicPlaylistCard({
  playlist,
}: {
  playlist: MusicPlaylistCardDto;
}) {
  return (
    <article className="glass flex items-center gap-3 rounded-2xl p-2.5">
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
        <MusicCover
          url={playlist.coverUrl}
          seed={playlist.id}
          alt={`Обложка подборки: ${playlist.title}`}
          rounded="rounded-xl"
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-text-0">
          {playlist.title}
        </span>
        <span className="truncate text-xs text-text-2">
          {playlist.trackCount}{" "}
          {plural(playlist.trackCount, "запись", "записи", "записей")}
          {playlist.totalSeconds > 0 &&
            ` · ${formatTotalDuration(playlist.totalSeconds)}`}
        </span>
      </span>
    </article>
  );
}
