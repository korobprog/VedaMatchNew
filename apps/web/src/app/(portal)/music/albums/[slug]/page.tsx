import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMusicAlbum } from "@/lib/music-api";
import { MusicCover } from "@/components/music/music-cover";
import { MusicTrackRow } from "@/components/music/music-track-row";
import { formatTotalDuration } from "@/lib/music-duration";
import { plural } from "@/lib/plural";

const KIND_LABELS: Record<string, string> = {
  album: "Альбом",
  live: "Запись программы",
  compilation: "Сборник",
  single: "Отдельная запись",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getMusicAlbum(slug);
  return { title: page ? page.album.title : "Альбом не найден" };
}

/**
 * Альбом или программа. Записи идут в порядке программы, а не по свежести —
 * порядок задаёт сервер, страница его не пересортировывает.
 */
export default async function MusicAlbumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getMusicAlbum(slug);

  if (!page) notFound();

  const { album, tracks } = page;
  const totalSeconds = tracks.reduce(
    (sum, track) => sum + track.durationSeconds,
    0,
  );

  const meta = [
    KIND_LABELS[album.kind],
    album.year ? String(album.year) : null,
    `${tracks.length} ${plural(tracks.length, "запись", "записи", "записей")}`,
    totalSeconds > 0 ? formatTotalDuration(totalSeconds) : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <Link
        href="/music"
        className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
      >
        <span aria-hidden="true">←</span> Каталог
      </Link>

      <header className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl">
          <MusicCover
            url={album.coverUrl}
            seed={album.id}
            alt={`Обложка: ${album.title}`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0">
            {album.title}
          </h1>
          {album.artist && (
            <Link
              href={`/music/artists/${album.artist.slug}`}
              className="text-base font-semibold text-cyan hover:text-magenta"
            >
              {album.artist.name}
            </Link>
          )}
          <p className="text-sm text-text-2">{meta.join(" · ")}</p>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="album-tracks">
        <h2
          id="album-tracks"
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
            {tracks.map((track, index) => (
              <li key={track.id}>
                <MusicTrackRow track={track} position={index + 1} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
