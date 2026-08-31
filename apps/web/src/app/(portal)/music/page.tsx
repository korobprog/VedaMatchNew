import type { Metadata } from "next";
import Link from "next/link";
import {
  getMusicCatalog,
  getMusicTracks,
  getMyMusicFavorites,
  getMyMusicPlaylists,
  getMyMusicUploads,
} from "@/lib/music-api";
import { MusicArtistBubble } from "@/components/music/music-artist-bubble";
import { MusicCategoryChips } from "@/components/music/music-category-chips";
import { MusicCover } from "@/components/music/music-cover";
import {
  MusicFilters,
  countMusicFilters,
  musicFilterHref,
} from "@/components/music/music-filters";
import { MusicPlaylistCard } from "@/components/music/music-playlist-card";
import { MusicRail } from "@/components/music/music-rail";
import { MusicSearchField } from "@/components/music/music-search-field";
import { MusicTrackList } from "@/components/music/music-track-list";
import { plural } from "@/lib/plural";

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
    artist?: string | string[];
    duration?: string | string[];
    live?: string | string[];
    sort?: string | string[];
    cursor?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;
  const category = first(params.category);
  const query = first(params.q);
  const artist = first(params.artist);
  const duration = first(params.duration);
  const live = first(params.live);
  const sort = first(params.sort);
  const cursor = first(params.cursor);
  // «Все записи» — та же страница, но без среза «Новое в каталоге».
  const showAll = first(params.all) !== null;

  const filterState = {
    category,
    q: query,
    artist,
    duration,
    live,
    sort,
    cursor,
  };
  const hasFilter = Boolean(
    category || query || artist || duration || live || sort || cursor,
  );

  // Витрина нужна всегда — из неё чипы разделов и исполнители для фильтра;
  // выборка догружается только когда стоит фильтр или задан запрос.
  const [catalog, filtered, mine, favorites, playlists] = await Promise.all([
    getMusicCatalog(),
    hasFilter || showAll
      ? getMusicTracks({
          ...(category ? { category } : {}),
          ...(query ? { q: query } : {}),
          ...(artist ? { artist } : {}),
          ...(duration ? { duration: duration as never } : {}),
          ...(live ? { live: live === "true" } : {}),
          ...(sort ? { sort: sort as never } : {}),
          ...(cursor ? { cursor } : {}),
          limit: showAll && !hasFilter ? 60 : 30,
        })
      : Promise.resolve(null),
    // Счётчики рельса — украшение, и падать из-за них каталог не должен.
    // Гостю приходит `null` и рельс просто без чисел; у вошедшего запрос
    // может упереться в лимит частоты или в упавший маршрут — тогда тоже
    // `null`, а не страница с ошибкой вместо всего каталога.
    getMyMusicUploads().catch(() => null),
    getMyMusicFavorites().catch(() => null),
    getMyMusicPlaylists().catch(() => null),
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
  // Заголовок обязан отвечать на «что я сейчас вижу». «Новое в каталоге» над
  // отобранным по длительности списком — прямое враньё, и человек читает его
  // как «фильтр не сработал».
  const heading = query
    ? `Найдено по запросу «${query}»`
    : (activeCategory?.title ??
      (countMusicFilters(filterState) > 0
        ? "Отобранное"
        : showAll
          ? "Все записи"
          : "Новое в каталоге"));

  const pendingUploads =
    mine?.items.filter((item) => item.status !== "published").length ?? 0;
  const myPlaylists = playlists?.items ?? [];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      {/* Рельс и свои плейлисты — одна колонка, как в макете каталога:
          «своя музыка» стоит слева целиком, а не разъезжается по экрану. */}
      <div className="flex shrink-0 flex-col gap-4 lg:w-56">
        <MusicRail
          active="catalog"
          uploadsCount={pendingUploads}
          favoritesCount={favorites?.items.length ?? 0}
          playlistsCount={myPlaylists.length}
        />
        {myPlaylists.length > 0 && (
          <section className="glass hidden flex-col gap-2 rounded-2xl border border-glass-brd p-3 lg:flex">
            <h2 className="text-xs font-bold text-text-1">Мои плейлисты</h2>
            {myPlaylists.slice(0, 3).map((playlist) => (
              <Link
                key={playlist.id}
                href={`/music/playlists/${playlist.id}`}
                className="flex items-center gap-2.5 text-text-1 hover:text-text-0"
              >
                <MusicCover
                  url={playlist.coverUrl}
                  seed={playlist.id}
                  alt=""
                  className="size-8 shrink-0"
                  fill={false}
                  rounded="rounded-[9px]"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-semibold">
                    {playlist.title}
                  </span>
                  <span className="text-[11px] text-text-2">
                    {playlist.trackCount}{" "}
                    {plural(
                      playlist.trackCount,
                      "запись",
                      "записи",
                      "записей",
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

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
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
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

      <div className="mt-6 flex flex-col gap-3">
        <MusicCategoryChips
          categories={catalog.categories}
          active={activeCategory?.slug ?? null}
        />
        <MusicFilters state={filterState} artists={catalog.artists} />
      </div>

      <section className="mt-8" aria-labelledby="music-tracks">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="music-tracks"
            className="font-display text-base font-bold text-text-0"
          >
            {heading}
          </h2>
          {!hasFilter && !showAll && catalog.fresh.length > 0 && (
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
          <MusicTrackList tracks={tracks} />
        )}

        {/* «Показать ещё», а не бесконечная прокрутка: план сервиса прямо
            называет бесконечную ленту маркером расползания Музыки во
            «Вдохновение». Ссылка, а не кнопка, — новая страница читается с
            сервера и работает без JavaScript. */}
        {filtered?.nextCursor && (
          <Link
            href={musicFilterHref(filterState, {
              cursor: filtered.nextCursor,
            })}
            className="mt-6 inline-flex h-10 items-center rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
          >
            Показать ещё
          </Link>
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
