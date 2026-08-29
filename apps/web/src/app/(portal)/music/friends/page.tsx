import type { Metadata } from "next";
import Link from "next/link";
import { MusicRail } from "@/components/music/music-rail";
import { MusicFriendPlaylistCard } from "@/components/music/friend-playlist-card";
import { getFriendMusicPlaylists } from "@/lib/music-api";

export const metadata: Metadata = {
  title: "У друзей",
  robots: { index: false, follow: false },
};

/**
 * Плейлисты тех, кто открыл доступ. См. docs/music-service-plan.md.
 *
 * Список чужих подборок, а не общая витрина: доступ даёт мэтч в Знакомствах
 * или раскрытые контакты в Общении, и портальный граф — единственный
 * источник правды об этом. Плейлисты с видимостью «только я» сюда не
 * попадают никогда.
 *
 * Пусто у того, кому никто не открывал доступ, — и это не поломка: сначала
 * знакомство, потом чужая музыка.
 */
export default async function MusicFriendsPage() {
  const data = await getFriendMusicPlaylists();
  const items = data?.items ?? [];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="friends" />

      <div className="min-w-0 flex-1">
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
          У друзей
        </h1>
        <p className="mb-5 text-sm text-text-2">
          Плейлисты тех, кто открыл вам доступ — мэтчем в Знакомствах или
          раскрытыми контактами в Общении. Можно послушать или забрать себе
          копией.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-text-1">
            Пока пусто. Плейлисты появятся здесь, когда кто-то из знакомых
            откроет доступ и соберёт свой — или откройте{" "}
            <Link href="/music" className="text-cyan hover:text-magenta">
              каталог
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((playlist) => (
              <MusicFriendPlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
