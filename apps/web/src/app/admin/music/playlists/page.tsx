import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicSystemPlaylists } from "@/components/music/admin/system-playlists";
import {
  getMusicAdminPlaylists,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";
import { getMusicPlaylist, getMusicTracks } from "@/lib/music-api";

export const metadata: Metadata = {
  title: "Подборки Музыки",
  robots: { index: false, follow: false },
};

/**
 * Подборки портала — тот самый блок «Подборки портала» на витрине каталога.
 * До этой страницы он всегда был пуст: модели были, а завести подборку было
 * нечем.
 *
 * Состав каждой читается страницей плейлиста, а не отдельным админским
 * маршрутом: это ровно тот же список, и второй способ его получить разошёлся
 * бы с первым.
 */
export default async function MusicAdminPlaylistsPage() {
  const [summary, playlists, catalog] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminPlaylists(),
    // Каталог для галочек: в общую подборку кладём только опубликованное.
    getMusicTracks({ limit: 60 }),
  ]);

  const items = playlists ?? [];
  const pages = await Promise.all(
    items.map((playlist) => getMusicPlaylist(playlist.id)),
  );

  const membership: Record<string, string[]> = {};
  items.forEach((playlist, at) => {
    membership[playlist.id] =
      pages[at]?.tracks.map((track) => track.id) ?? [];
  });

  return (
    <>
      <MusicAdminTabs active="playlists" pendingCount={summary?.pending ?? 0} />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Подборки видны всем на витрине каталога. В них кладём только
        опубликованные записи: с витрины человек не должен упираться в то, что
        ему слушать нельзя.
      </p>

      <MusicSystemPlaylists
        playlists={items}
        tracks={catalog?.items ?? []}
        membership={membership}
      />
    </>
  );
}
