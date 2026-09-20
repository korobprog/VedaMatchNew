import type { Metadata } from "next";
import Link from "next/link";
import { getMusicAudiobooks } from "@/lib/music-api";
import { MusicArtistsSection } from "@/components/music/music-artists-section";
import { MusicRail } from "@/components/music/music-rail";
import { MusicTrackList } from "@/components/music/music-track-list";
import { plural } from "@/lib/plural";

export const metadata: Metadata = {
  title: "Аудиокниги",
  description: "Книги и лекции в записи: главы подряд, плеер на весь портал",
};

/**
 * Раздел «Аудиокниги» (VED-237).
 *
 * Устроен как витрина Медиатеки — чтецы карточками, записи списком, — но
 * своим срезом каталога: сюда попадают записи исполнителей, отмеченных в
 * справочниках как чтецы («это аудиокниги»). В общем каталоге их нет, и
 * это прямое требование карточки: «отображение всех аудиокниг должно
 * находиться внутри этой кнопки».
 *
 * Разметка стоит у исполнителя, а не у записи (та же схема, что у корневой
 * категории, VED-165-2): новая глава того же чтеца попадает в раздел сама.
 */
export default async function MusicAudiobooksPage() {
  const page = await getMusicAudiobooks();

  if (!page) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <h1 className="font-display text-2xl font-bold text-text-0">
          Аудиокниги
        </h1>
        <p className="mt-3 text-sm text-text-1">
          Раздел сейчас недоступен. Попробуйте обновить страницу.
        </p>
      </main>
    );
  }

  const { artists, tracks, totalTracks } = page;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <div className="flex shrink-0 flex-col gap-4 lg:w-56">
        <MusicRail active="catalog" />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href="/music"
          className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
        >
          <span aria-hidden="true">←</span> Медиатека
        </Link>

        <header className="mt-4 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
              Аудиокниги
            </h1>
            {totalTracks > 0 && (
              <span
                title={`Всего записей в разделе: ${totalTracks}`}
                className="font-mono text-xs font-medium text-text-2"
              >
                {totalTracks}{" "}
                {plural(totalTracks, "запись", "записи", "записей")}
              </span>
            )}
          </div>
          <p className="text-sm text-text-2">
            Книги и лекции в записи. Главы идут подряд: включите первую —
            плеер дослушает книгу до конца.
          </p>
        </header>

        {artists.length > 0 && (
          <section className="mt-8" aria-labelledby="audiobook-artists">
            <h2
              id="audiobook-artists"
              className="font-display text-base font-bold text-text-0"
            >
              Чтецы
            </h2>
            {/* Карточка чтеца ведёт на его обычную страницу исполнителя: там
                уже есть и список записей, и «Слушать всё до конца» — книга
                целиком, без отдельной страницы под неё. */}
            <MusicArtistsSection artists={artists} />
          </section>
        )}

        <section className="mt-8" aria-labelledby="audiobook-tracks">
          <h2
            id="audiobook-tracks"
            className="font-display text-base font-bold text-text-0"
          >
            Все записи
          </h2>
          {tracks.length === 0 ? (
            <p className="mt-3 text-sm text-text-1">
              Аудиокниг пока нет. Редакция отмечает чтеца в админке Музыки —
              «Справочники» → «Исполнители» → «Аудиокниги», — и все его
              записи, включая будущие, появляются здесь.
            </p>
          ) : (
            <MusicTrackList tracks={tracks} />
          )}
        </section>
      </div>
    </main>
  );
}
