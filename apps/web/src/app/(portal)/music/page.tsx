import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { MusicRadioButton } from "@/components/music/radio/radio-button";
import { getLocale } from "next-intl/server";
import {
  canAdminService,
  isLineagePreference,
  isMusicTrackSort,
  resolveContentLineage,
  serviceCardName,
} from "@vedamatch/shared";
import { getProfile, getServiceCard } from "@/lib/api";
import {
  getMusicCatalog,
  getMusicSettingsServer,
  getMusicTracks,
  getMyMusicFavorites,
  getMyMusicPlaylists,
  getMyMusicUploads,
} from "@/lib/music-api";
import { LineageStatus } from "@/components/lineage-status";
import { MusicArtistsSection } from "@/components/music/music-artists-section";
import { MusicCover } from "@/components/music/music-cover";
import {
  MusicFilters,
  countMusicFilters,
  musicFilterHref,
} from "@/components/music/music-filters";
import { MusicPlaylistCard } from "@/components/music/music-playlist-card";
import { MusicRail } from "@/components/music/music-rail";
import { MusicRootTabs } from "@/components/music/music-root-tabs";
import {
  artistsInRoot,
  findRootCategory,
} from "@/components/music/music-root-scope";
import { MusicSearchField } from "@/components/music/music-search-field";
import { MusicTrackList } from "@/components/music/music-track-list";
import { plural } from "@/lib/plural";

/** Слаг сервиса в каталоге. Им же берётся карточка с названием и описанием. */
const SERVICE_SLUG = "music";

/**
 * Запасное название на случай, когда каталог не ответил. Настоящее приходит
 * из карточки сервиса (админка → каталог), как и в шапке, на лендинге и в
 * сетке портала: переименование раздела делается там, а не правкой кода.
 * Запасного ОПИСАНИЯ здесь нет намеренно — подпись под заголовком целиком
 * принадлежит администратору, и выдуманная строка вместо неё врёт.
 */
const FALLBACK_NAME = "Музыка";

// Суффикс «— VedaMatch» подставляет шаблон в корневом layout; дублировать
// его здесь значит получить его дважды в заголовке вкладки.
export async function generateMetadata(): Promise<Metadata> {
  const [service, locale] = await Promise.all([
    getServiceCard(SERVICE_SLUG),
    getLocale(),
  ]);
  return {
    title: service ? serviceCardName(service, locale) : FALLBACK_NAME,
    description: service?.description || undefined,
  };
}

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
    root?: string | string[];
    category?: string | string[];
    q?: string | string[];
    all?: string | string[];
    artist?: string | string[];
    lineage?: string | string[];
    sort?: string | string[];
    cursor?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;
  // Корневая категория витрины (VED-165) — «Традиционное»/«Современное»,
  // независимый параметр рядом с `category` (стиль): оба применяются как
  // пересечение.
  const root = first(params.root);
  const category = first(params.category);
  const query = first(params.q);
  const artist = first(params.artist);
  // Порядок выдачи — ряд «Порядок» в панели фильтров (VED-165). Незнакомое
  // значение отсеивается здесь же и становится «не просили»: старая ссылка
  // `?sort=duration` обязана открыть обычную выдачу, а не подсветить чип,
  // которого нет, и не повиснуть в адресе следующих ссылок. Сервер поступает
  // ровно так же — `isMusicTrackSort` у нас с ним общий.
  const rawSort = first(params.sort);
  const sort = isMusicTrackSort(rawSort) ? rawSort : null;
  const cursor = first(params.cursor);
  // Явный выбор линии на один просмотр: `all` или идентификатор. Витрина
  // его не понимает — она фильтруется по профилю, — поэтому с ним сразу
  // идём в полный список, как с «Все записи».
  const rawLineage = first(params.lineage);
  const explicitLineage =
    rawLineage && isLineagePreference(rawLineage) ? rawLineage : null;
  // «Все записи» — та же страница, но без среза «Новое в каталоге».
  const showAll = first(params.all) !== null || explicitLineage !== null;

  const filterState = {
    root,
    category,
    q: query,
    artist,
    sort,
    cursor,
  };
  const hasFilter = Boolean(
    root || category || query || artist || sort || cursor,
  );

  // Витрина нужна всегда — из неё чипы разделов и исполнители для фильтра;
  // выборка догружается только когда стоит фильтр или задан запрос.
  const [
    service,
    locale,
    catalog,
    filtered,
    mine,
    favorites,
    playlists,
    settings,
    profile,
  ] = await Promise.all([
      // Название и подпись раздела — из каталога сервисов: их правит
      // администратор, а не правка кода. cache() в getServiceCard делает
      // этот запрос общим с generateMetadata.
      getServiceCard(SERVICE_SLUG),
      getLocale(),
      getMusicCatalog(root),
      hasFilter || showAll
        ? getMusicTracks({
            ...(root ? { root } : {}),
            ...(category ? { category } : {}),
            ...(query ? { q: query } : {}),
            ...(artist ? { artist } : {}),
            ...(explicitLineage ? { lineage: explicitLineage } : {}),
            ...(sort ? { sort } : {}),
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
      // Настройки — ради линии: подпись над списком ставится, только когда
      // человек сам выбрал линию в настройках Музыки. Гостю — null.
      getMusicSettingsServer().catch(() => null),
      getProfile().catch(() => null),
    ]);

  // «Добавить исполнителя» (VED-513) — редакции Музыки: справочник
  // исполнителей правит только она.
  const canEditMusic = profile
    ? canAdminService(
        { role: profile.role, adminServices: profile.adminServices },
        "music",
      )
    : false;
  const artistsToolbar = (
    <>
      {/* «Радио» (VED-437) — отдельный режим, а не раздел каталога. */}
      <MusicRadioButton />
      {canEditMusic && (
        <Link
          href="/admin/music/catalog"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-glass-brd px-3 text-xs font-medium text-text-1 hover:text-text-0"
        >
          <UserPlus aria-hidden className="size-3.5" />
          {/* На телефоне — «Добавить»: полной подписи с «Радио» и «Списком»
              в одном ряду места нет, а значок человека с плюсом досказывает. */}
          <span aria-hidden className="sm:hidden">
            Добавить
          </span>
          <span className="sr-only sm:not-sr-only">Добавить исполнителя</span>
        </Link>
      )}
    </>
  );

  // Та же арифметика, что в API: явный параметр сильнее настройки Музыки, а
  // линию из профиля Музыка не наследует (VED-82) — без настройки слышно всё
  // и подписи нет. Подпись обязана говорить то, что применил сервер.
  const appliedLineage = explicitLineage
    ? resolveContentLineage(null, explicitLineage)
    : resolveContentLineage(null, settings?.lineage ?? null);

  const serviceName = service
    ? serviceCardName(service, locale)
    : FALLBACK_NAME;
  const serviceDescription = service?.description?.trim() || null;

  if (!catalog) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <h1 className="font-display text-2xl font-bold text-text-0">
          {serviceName}
        </h1>
        <p className="mt-3 text-sm text-text-1">
          Каталог сейчас недоступен. Попробуйте обновить страницу.
        </p>
      </main>
    );
  }

  const activeCategory =
    catalog.categories.find((item) => item.slug === category) ?? null;
  const activeRoot = findRootCategory(catalog.categories, root);
  // Вкладка сужает не только записи, но и людей (VED-165): исполнитель
  // «второй папки» уходит с экрана вместе со своими записями — и из кружков
  // над списком, и из ряда «Исполнитель» в панели фильтров, иначе оттуда
  // можно выбрать исполнителя, которого в этом срезе нет, и получить пустую
  // выдачу.
  const rootArtists = artistsInRoot(catalog.artists, activeRoot?.id ?? null);
  const tracks = filtered ? filtered.items : catalog.fresh;
  // Заголовок обязан отвечать на «что я сейчас вижу». «Новое в каталоге» над
  // отобранным списком — прямое враньё, и человек читает его как «фильтр не
  // сработал». Корневая и стиль выбраны вместе (VED-165) —
  // заголовок называет оба, а не один из них.
  const heading = query
    ? `Найдено по запросу «${query}»`
    : activeRoot && activeCategory
      ? `${activeRoot.title} · ${activeCategory.title}`
      : (activeRoot?.title ??
        activeCategory?.title ??
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
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
              {serviceName}
            </h1>
            {/* Рядом с названием, а не отдельной плашкой: это ответ на «а
                много ли тут вообще» — и спрашивают его ровно тогда, когда
                читают заголовок (тот же приём, что в шапке «Вдохновения»,
                motivation-top-bar.tsx). Число — как остальная витрина: с
                учётом линии зрителя, а не по всей базе. */}
            {catalog.totalTracks > 0 && (
              <span
                title={`Всего записей в каталоге: ${catalog.totalTracks}`}
                className="font-mono text-xs font-medium text-text-2"
              >
                {catalog.totalTracks}{" "}
                {plural(catalog.totalTracks, "запись", "записи", "записей")}
              </span>
            )}
          </div>
          {/* Подписи может и не быть: администратор вправе оставить описание
              пустым, и пустой абзац на её месте — лишний отступ под
              заголовком. */}
          {serviceDescription && (
            <p className="text-sm text-text-2">{serviceDescription}</p>
          )}
          <LineageStatus
            lineage={appliedLineage}
            settingsHref="/music/settings"
            allHref="/music?all=1&lineage=all"
          />
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <MusicSearchField value={query} root={root} category={category} />
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
        <MusicRootTabs categories={catalog.categories} state={filterState} />
        {/* «Фильтры» и «Аудиокниги» — одним рядом, как на скриншоте
            карточки VED-237: раздел книг стоит рядом с фильтрами каталога,
            а не прячется в меню. Сами аудиокниги в каталоге не
            показываются — их «отображение находится внутри этой кнопки». */}
        <div className="flex flex-wrap items-start gap-2">
          <MusicFilters
            state={filterState}
            artists={rootArtists}
            categories={catalog.categories}
          />
          <Link
            href="/music/audiobooks"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-glass-brd px-3 text-xs font-medium text-text-1 hover:text-text-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
              <path d="M9 7h6" />
            </svg>
            Аудиокниги
          </Link>
          {/* «Лекции» (VED-437) — сразу за «Аудиокнигами»: устроены так же. */}
          <Link
            href="/music/lectures"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-glass-brd px-3 text-xs font-medium text-text-1 hover:text-text-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
            Лекции
          </Link>
        </div>
        {/* Второй ряд (VED-513): «Радио» и «Добавить исполнителя» слева,
            «Списком» — справа. Пока исполнителей нет, переключателя нет, и
            ряд стоит сам по себе. */}
        {rootArtists.length === 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {artistsToolbar}
          </div>
        )}
      </div>

      {/* Исполнители — до списка записей. Хвостом после подборок их не
          находили: человек видел «Исполнитель не указан» у каждой строки и
          уходил, не долистав. Секция целиком подчиняется выбранной корневой
          вкладке (VED-165): у «Традиционного» нет ни одного современного
          исполнителя, а не «записей нет, а кружки на месте». */}
      {rootArtists.length > 0 && (
        <section className="mt-3" aria-labelledby="music-artists">
          {/* Сетка по четыре кружка в ряд, заполняется слева направо
              (VED-103, VED-115). Витрина отдаёт всех исполнителей выбранной
              вкладки, и каждый
              следующий после восьмого встаёт новым рядом снизу (VED-224) —
              прокрутки вбок нет ни на телефоне, ни на широком экране: лента
              прятала хвост за краем. Переключатель вида — «плиткой»/«списком»
              — внутри компонента, тем же приёмом, что у записей ниже (VED-225). */}
          <MusicArtistsSection
            artists={rootArtists}
            toolbar={artistsToolbar}
            heading={
              <h2
                id="music-artists"
                className="mt-6 font-display text-base font-bold text-text-0"
              >
                Исполнители
              </h2>
            }
          />
        </section>
      )}

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
              : activeRoot || activeCategory
                ? "В этом разделе пока пусто. Загляните в другие или посмотрите всё."
                : appliedLineage
                  ? "Для вашей линии записей пока нет. Записи других линий скрыты."
                  : "Каталог пока пуст. Записи появятся, как только редакция начнёт его наполнять."}
            {appliedLineage && (
              <>
                {" "}
                <Link
                  href="/music?all=1&lineage=all"
                  className="text-cyan underline hover:text-magenta"
                >
                  Показать записи всех линий
                </Link>
              </>
            )}
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
