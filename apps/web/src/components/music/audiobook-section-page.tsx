import Link from "next/link";
import type { MusicAudiobookKind } from "@vedamatch/shared";
import { getMusicAudiobooks } from "@/lib/music-api";
import { plural } from "@/lib/plural";
import { MusicAudiobookCard } from "./audiobook-card";
import { AUDIOBOOK_KIND_COPY } from "./audiobook-kind";
import { MusicRail } from "./music-rail";

/**
 * Раздел «Аудиокниги» (VED-237 → VED-297) или «Лекции» (VED-437).
 *
 * Каждая единица — самостоятельная: своя плитка с обложкой, автором и
 * чтецом, внутри — части по порядку. В общем каталоге частей нет:
 * «отображение всех аудиокниг находится внутри этой кнопки».
 */
export async function MusicAudiobookSectionPage({
  kind,
}: {
  kind: MusicAudiobookKind;
}) {
  const copy = AUDIOBOOK_KIND_COPY[kind];
  const page = await getMusicAudiobooks(kind);

  if (!page) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <h1 className="font-display text-2xl font-bold text-text-0">
          {copy.section}
        </h1>
        <p className="mt-3 text-sm text-text-1">
          Раздел сейчас недоступен. Попробуйте обновить страницу.
        </p>
      </main>
    );
  }

  const { books } = page;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <div className="flex shrink-0 flex-col gap-4 lg:w-56">
        <MusicRail active="catalog" />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href="/music"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
        >
          <span aria-hidden="true">←</span> Музыка
        </Link>

        <header className="mt-2 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
              {copy.section}
            </h1>
            {books.length > 0 && (
              <span className="font-mono text-xs font-medium text-text-2">
                {books.length} {plural(books.length, ...copy.unit)}
              </span>
            )}
          </div>
          <p className="text-sm text-text-2">{copy.lead}</p>
        </header>

        {books.length === 0 ? (
          <p className="mt-8 text-sm text-text-1">{copy.empty}</p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {books.map((book) => (
              <li key={book.id}>
                <MusicAudiobookCard book={book} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
