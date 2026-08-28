import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MusicCover } from "@/components/music/music-cover";
import { MusicPlayAllButton } from "@/components/music/player/play-all-button";
import { MusicTrackRow } from "@/components/music/music-track-row";
import { formatTotalDuration } from "@/lib/music-duration";
import { getMusicPlaylist } from "@/lib/music-api";
import { plural } from "@/lib/plural";

const VISIBILITY_LABEL = {
  private: "только я",
  friends: "для друзей",
  public: "для всех",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const page = await getMusicPlaylist(id);

  return {
    title: page?.playlist.title ?? "Плейлист",
    // Закрытый плейлист в поиске не нужен, а публичный ведёт себя как
    // страница каталога.
    robots:
      page?.playlist.visibility === "public"
        ? undefined
        : { index: false, follow: false },
  };
}

/**
 * Страница плейлиста. Рельса здесь нет намеренно: это не раздел «своей
 * музыки», а конкретная подборка, и на неё приходят по ссылке из ленты
 * друзей ничуть не реже, чем из своего списка.
 *
 * Обложка слева, список записей справа — как на странице альбома: это тот же
 * по смыслу экран, и вторая раскладка для него разошлась бы с первой на
 * первой же правке.
 */
export default async function MusicPlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const page = await getMusicPlaylist(id);
  if (!page) notFound();

  const { playlist, tracks } = page;
  const queue = tracks.map((track) => track.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <Link
        href="/music/playlists"
        className="text-sm text-cyan hover:text-magenta"
      >
        ← Плейлисты
      </Link>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <MusicCover
          url={playlist.coverUrl}
          seed={playlist.id}
          alt=""
          className="size-40 shrink-0 sm:size-48"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            {playlist.title}
          </h1>
          {playlist.description && (
            <p className="text-sm text-text-1">{playlist.description}</p>
          )}
          <p className="text-sm text-text-2">
            {`${playlist.trackCount} ${plural(
              playlist.trackCount,
              "запись",
              "записи",
              "записей",
            )}`}
            {playlist.totalSeconds > 0 &&
              ` · ${formatTotalDuration(playlist.totalSeconds)}`}
            {playlist.isSystem
              ? " · подборка портала"
              : ` · ${VISIBILITY_LABEL[playlist.visibility]}`}
          </p>
        </div>
      </header>

      {tracks.length === 0 ? (
        <p className="mt-8 text-sm text-text-1">
          В плейлисте пока нет записей.
        </p>
      ) : (
        <>
          {/* Очередь — весь список. Отдельной кнопкой, потому что строки
              ведут на карточку записи, а не запускают её. */}
          <div className="mt-6">
            <MusicPlayAllButton queue={queue} />
          </div>

          <ul className="mt-4 flex flex-col">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <MusicTrackRow track={track} position={index + 1} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
