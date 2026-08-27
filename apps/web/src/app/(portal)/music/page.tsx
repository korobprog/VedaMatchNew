import type { Metadata } from "next";
import Link from "next/link";
import {
  getMusicCatalog,
  getMusicTracks,
  getMyMusicUploads,
} from "@/lib/music-api";
import { MusicArtistBubble } from "@/components/music/music-artist-bubble";
import { MusicCategoryChips } from "@/components/music/music-category-chips";
import { MusicPlaylistCard } from "@/components/music/music-playlist-card";
import { MusicRail } from "@/components/music/music-rail";
import { MusicSearchField } from "@/components/music/music-search-field";
import { MusicTrackCard } from "@/components/music/music-track-card";

// Суффикс «— VedaMatch» подставляет шаблон в корневом layout; дублировать
// его здесь значит получить его дважды в заголовке вкладки.
export const metadata: Metadata = {
  title: "Музыка",
  description: "Киртаны, бхаджаны и записи с программ",
};

/**
 * Витрина Музыки. См. docs/music-service-plan.md.
 *
 * Этап 1 — каталог: разделы, новое, исполнители, подборки. Плеера ещё нет,
 * поэтому карточка ведёт на страницу записи, а не начинает воспроизведение.
 *
 * Фильтр по разделу живёт в адресе, а не в состоянии компонента: страницу
 * с бхаджанами должно быть можно переслать, а «назад» обязан снимать фильтр,
 * а не уводить с сервиса.
 */
export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string | string[];
    q?: string | string[];
    all?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;
  const category = first(params.category);
  const query = first(params.q);
  // «Все записи» — та же страница, но без среза «Новое в каталоге».
  const showAll = first(params.all) !== null;

  // Витрина нужна всегда — из неё чипы разделов; выборка догружается только
  // когда стоит фильтр или задан запрос.
  const [catalog, filtered, mine] = await Promise.all([
    getMusicCatalog(),
    category || query || showAll
      ? getMusicTracks({
          ...(category ? { category } : {}),
          ...(query ? { q: query } : {}),
          limit: showAll && !category && !query ? 60 : 30,
        })
      : Promise.resolve(null),
    // Счётчик рельса. Гостю отдаётся null и рельс просто без числа.
    getMyMusicUploads(),
  ]);

  if (!catalog) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <h1 className="font-display text-2xl font-bold text-text-0">Музыка</h1>
        <p className="mt-3 text-sm text-text-1">
          Каталог сейчас недоступен. Попробуйте обновить страницу.
        </p>
      </main>
    );
  }

  const activeCategory =
    catalog.categories.find((item) => item.slug === category) ?? null;
  const tracks = filtered ? filtered.items : catalog.fresh;
  const heading = query
    ? `Найдено по запросу «${query}»`
    : (activeCategory?.title ?? (showAll ? "Все записи" : "Новое в каталоге"));

  const pendingUploads =
    mine?.items.filter((item) => item.status !== "published").length ?? 0;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="catalog" uploadsCount={pendingUploads} />

      <div className="min-w-0 flex-1">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            Музыка
          </h1>
          <p className="text-sm text-text-2">
            Киртаны, бхаджаны и записи с программ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MusicSearchField value={query} category={category} />
          {/* Загружать может любой вошедший: сервис наполняется записями с
              программ, а редакция их разбирает. Кнопка стоит на виду, а не
              прячется в меню, — иначе о такой возможности не узнают. */}
          <Link
            href="/music/uploads"
            className="btn-mint flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Загрузить
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <MusicCategoryChips
          categories={catalog.categories}
          active={activeCategory?.slug ?? null}
        />
      </div>

      <section className="mt-8" aria-labelledby="music-tracks">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="music-tracks"
            className="font-display text-base font-bold text-text-0"
          >
            {heading}
          </h2>
          {!query && !activeCategory && !showAll && catalog.fresh.length > 0 && (
            <Link
              href="/music?all=1"
              className="shrink-0 py-1 text-xs text-cyan hover:text-magenta"
            >
              Все записи
            </Link>
          )}
        </div>

        {tracks.length === 0 ? (
          <p className="mt-3 text-sm text-text-1">
            {query
              ? "Ничего не нашлось. Попробуйте другое слово или посмотрите весь каталог."
              : activeCategory
                ? "В этом разделе пока пусто. Загляните в другие или посмотрите всё."
                : "Каталог пока пуст. Записи появятся, как только редакция начнёт его наполнять."}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {tracks.map((track) => (
              <li key={track.id}>
                <MusicTrackCard track={track} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {catalog.artists.length > 0 && (
        <section className="mt-10" aria-labelledby="music-artists">
          <h2
            id="music-artists"
            className="font-display text-base font-bold text-text-0"
          >
            Исполнители
          </h2>
          <ul className="scroll-slim mt-4 flex gap-5 overflow-x-auto pb-2">
            {catalog.artists.map((artist) => (
              <li key={artist.id}>
                <MusicArtistBubble artist={artist} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {catalog.systemPlaylists.length > 0 && (
        <section className="mt-10" aria-labelledby="music-playlists">
          <h2
            id="music-playlists"
            className="font-display text-base font-bold text-text-0"
          >
            Подборки портала
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.systemPlaylists.map((playlist) => (
              <li key={playlist.id}>
                <MusicPlaylistCard playlist={playlist} />
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </main>
  );
}
