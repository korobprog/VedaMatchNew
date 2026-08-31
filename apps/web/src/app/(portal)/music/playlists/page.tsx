import type { Metadata } from "next";
import Link from "next/link";
import { MusicRail } from "@/components/music/music-rail";
import { MusicCover } from "@/components/music/music-cover";
import { formatTotalDuration } from "@/lib/music-duration";
import { getMyMusicPlaylists } from "@/lib/music-api";
import { plural } from "@/lib/plural";

export const metadata: Metadata = {
  title: "Плейлисты",
  robots: { index: false, follow: false },
};

const VISIBILITY_LABEL = {
  private: "только я",
  friends: "для друзей",
  public: "для всех",
} as const;

/**
 * Свои плейлисты списком, а не сеткой карточек: у плейлиста важнее подпись
 * («14 записей · 58 мин · только я»), чем обложка, и в сетке эта подпись
 * ужимается до нечитаемой.
 *
 * Создание живёт в шторке «В плейлист» на карточке записи: плейлист заводят,
 * когда есть что в него положить, а пустой список, созданный заранее, так и
 * остаётся пустым.
 */
export default async function MusicPlaylistsPage() {
  const playlists = await getMyMusicPlaylists().catch(() => null);
  const items = playlists?.items ?? [];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="playlists" playlistsCount={items.length} />

      <div className="min-w-0 flex-1">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            Плейлисты
          </h1>
          <p className="text-sm text-text-2">
            Свои подборки записей — от утреннего киртана до фона для джапы
          </p>
        </header>

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-text-1">
            Пока пусто. Плейлист заводится там, где есть что в него положить:
            откройте запись и нажмите «В плейлист».
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {items.map((playlist) => (
              <li key={playlist.id}>
                <Link
                  href={`/music/playlists/${playlist.id}`}
                  className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3 hover:border-violet/40"
                >
                  <MusicCover
                    url={playlist.coverUrl}
                    seed={playlist.id}
                    alt=""
                    className="size-12"
                    fill={false}
                    rounded="rounded-xl"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-text-0">
                      {playlist.title}
                    </span>
                    <span className="truncate text-xs text-text-2">
                      {`${playlist.trackCount} ${plural(
                        playlist.trackCount,
                        "запись",
                        "записи",
                        "записей",
                      )}`}
                      {playlist.totalSeconds > 0 &&
                        ` · ${formatTotalDuration(playlist.totalSeconds)}`}
                      {` · ${VISIBILITY_LABEL[playlist.visibility]}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
