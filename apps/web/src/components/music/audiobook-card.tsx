import Link from "next/link";
import type { MusicAudiobookCardDto } from "@vedamatch/shared";
import { MusicCover } from "./music-cover";
import { audiobookMeta } from "./audiobook-labels";

/**
 * Плитка книги (VED-297): обложка, название, автор и чтец, сколько глав и
 * часов. Вся плитка — одна ссылка на страницу книги: внутри неё нет второй
 * кнопки, и скринридер читает её одной фразой.
 */
export function MusicAudiobookCard({ book }: { book: MusicAudiobookCardDto }) {
  const people = [book.author, book.reader ? `читает ${book.reader.name}` : null]
    .filter(Boolean)
    .join(" · ");
  const meta = audiobookMeta(book.chapterCount, book.totalSeconds);

  return (
    <Link
      href={`/music/audiobooks/${book.slug}`}
      className="glass flex h-full flex-col gap-2.5 rounded-2xl p-2.5 transition-colors hover:border-cyan/40"
    >
      <span className="aspect-square w-full overflow-hidden rounded-xl">
        <MusicCover
          url={book.coverUrl}
          seed={book.id}
          alt=""
          rounded="rounded-xl"
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
        <span className="line-clamp-2 text-sm font-semibold text-text-0">
          {book.title}
        </span>
        {people && (
          <span className="line-clamp-2 text-xs text-text-1">{people}</span>
        )}
        {meta && <span className="text-xs text-text-2">{meta}</span>}
      </span>
    </Link>
  );
}
