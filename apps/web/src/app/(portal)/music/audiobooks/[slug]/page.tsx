import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAdminService } from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { getMusicAudiobook } from "@/lib/music-api";
import { audiobookMeta } from "@/components/music/audiobook-labels";
import { MusicAudiobookPlayback } from "@/components/music/audiobook-playback";
import { MusicCover } from "@/components/music/music-cover";
import { MusicTrackRow } from "@/components/music/music-track-row";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getMusicAudiobook(slug);
  return { title: page ? page.book.title : "Книга не найдена" };
}

/**
 * Страница аудиокниги (VED-297): обложка, автор, чтец, описание и главы по
 * порядку книги. Порядок задаёт редакция, страница его не пересортировывает.
 *
 * Место, где человек остановился, сервер считает по позициям плеера — оно
 * одно на все устройства: начал в дороге с телефона, дослушал дома.
 */
export default async function MusicAudiobookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, user] = await Promise.all([
    getMusicAudiobook(slug),
    getProfile().catch(() => null),
  ]);

  if (!page) notFound();

  const { book, chapters, resume } = page;
  const queue = chapters.map((track) => track.id);
  const meta = audiobookMeta(book.chapterCount, book.totalSeconds);
  const isMusicEditor = user
    ? canAdminService(
        { role: user.role, adminServices: user.adminServices },
        "music",
      )
    : false;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <Link
        href="/music/audiobooks"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
      >
        <span aria-hidden="true">←</span> Аудиокниги
      </Link>

      <header className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl">
          <MusicCover
            url={book.coverUrl}
            seed={book.id}
            alt={`Обложка: ${book.title}`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0">
            {book.title}
          </h1>
          {book.author && (
            <p className="text-base text-text-1">{book.author}</p>
          )}
          {book.reader && (
            <p className="text-sm text-text-2">
              Читает{" "}
              <Link
                href={`/music/artists/${book.reader.slug}`}
                className="font-semibold text-text-0 underline decoration-glass-brd underline-offset-4 hover:decoration-current"
              >
                {book.reader.name}
              </Link>
            </p>
          )}
          {meta && <p className="text-sm text-text-2">{meta}</p>}
          {isMusicEditor && (
            <Link
              href="/admin/music/audiobooks"
              className="inline-flex min-h-11 items-center self-start text-sm text-text-2 underline decoration-glass-brd underline-offset-4 hover:text-text-0"
            >
              Править книгу в админке
            </Link>
          )}
        </div>
      </header>

      <div className="mt-5">
        <MusicAudiobookPlayback queue={queue} resume={resume} />
      </div>

      {book.description && (
        <p className="mt-6 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-text-1">
          {book.description}
        </p>
      )}

      <section className="mt-8" aria-labelledby="audiobook-chapters">
        <h2
          id="audiobook-chapters"
          className="font-display text-base font-bold text-text-0"
        >
          Главы
        </h2>
        {chapters.length === 0 ? (
          <p className="mt-3 text-sm text-text-1">
            Опубликованных глав пока нет.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {chapters.map((track, index) => (
              <li key={track.id}>
                <MusicTrackRow
                  track={track}
                  position={index + 1}
                  queue={queue}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
