import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMusicArtist } from "@/lib/music-api";
import { MusicCover } from "@/components/music/music-cover";
import { MusicTrackRow } from "@/components/music/music-track-row";
import { plural } from "@/lib/plural";

const KIND_LABELS: Record<string, string> = {
  kirtaneer: "Киртанья",
  group: "Коллектив",
  temple: "Храм",
  unknown: "",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getMusicArtist(slug);
  return { title: page ? page.artist.name : "Исполнитель не найден" };
}

/** Страница исполнителя: кто это, его программы и записи. */
export default async function MusicArtistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getMusicArtist(slug);

  if (!page) notFound();

  const { artist, albums, tracks } = page;
  // Очередь — записи исполнителя: см. комментарий на странице альбома.
  const queue = tracks.map((track) => track.id);
  const kind = KIND_LABELS[artist.kind] ?? "";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <Link
        href="/music"
        className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
      >
        <span aria-hidden="true">←</span> Каталог
      </Link>

      <header className="mt-5 flex items-center gap-5">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full">
          <MusicCover
            url={artist.coverUrl}
            seed={artist.id}
            alt={`Фото: ${artist.name}`}
            rounded="rounded-full"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0">
            {artist.name}
          </h1>
          <p className="text-sm text-text-2">
            {[kind, `${artist.trackCount} ${plural(artist.trackCount, "запись", "записи", "записей")}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {artist.bio && (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-1">
          {artist.bio}
        </p>
      )}

      {albums.length > 0 && (
        <section className="mt-8" aria-labelledby="artist-albums">
          <h2
            id="artist-albums"
            className="font-display text-base font-bold text-text-0"
          >
            Программы и альбомы
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`/music/albums/${album.slug}`}
                  className="glass flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:border-cyan/40"
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                    <MusicCover
                      url={album.coverUrl}
                      seed={album.id}
                      alt={`Обложка: ${album.title}`}
                      rounded="rounded-xl"
                    />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-text-0">
                      {album.title}
                    </span>
                    <span className="text-xs text-text-2">
                      {[album.year, `${album.trackCount} ${plural(album.trackCount, "запись", "записи", "записей")}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="artist-tracks">
        <h2
          id="artist-tracks"
          className="font-display text-base font-bold text-text-0"
        >
          Записи
        </h2>
        {tracks.length === 0 ? (
          <p className="mt-3 text-sm text-text-1">
            Опубликованных записей пока нет.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {tracks.map((track) => (
              <li key={track.id}>
                <MusicTrackRow track={track} queue={queue} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
