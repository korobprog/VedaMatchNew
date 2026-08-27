import type { Metadata } from "next";
import { MusicRail } from "@/components/music/music-rail";
import { MusicTrackCard } from "@/components/music/music-track-card";
import { getMyMusicFavorites } from "@/lib/music-api";

export const metadata: Metadata = {
  title: "Избранное",
  robots: { index: false, follow: false },
};

/**
 * Своё избранное. Той же сеткой, что каталог: это тот же список записей, и
 * заводить для него вторую раскладку значило бы разойтись с ней при первой
 * же правке карточки.
 *
 * Снятые с витрины записи сюда не попадают — сердце остаётся нажатым, но
 * отдавать скрытую по жалобе запись в обход каталога нельзя. Решает это
 * сервер, страница ничего не фильтрует.
 */
export default async function MusicFavoritesPage() {
  const favorites = await getMyMusicFavorites();
  const items = favorites?.items ?? [];
  const queue = items.map((track) => track.id);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="favorites" favoritesCount={items.length} />

      <div className="min-w-0 flex-1">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            Избранное
          </h1>
          <p className="text-sm text-text-2">
            Записи, которые вы отметили сердцем
          </p>
        </header>

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-text-1">
            Пока пусто. Сердце есть на карточке записи и в полосе плеера.
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((track) => (
              <li key={track.id}>
                <MusicTrackCard track={track} queue={queue} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
