import Link from "next/link";
import type { MusicArtistDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";
import { MusicCover } from "./music-cover";

/**
 * Исполнитель кружком. Счётчик записей — не украшение: он единственное, что
 * отличает киртанью с одной записью от того, у кого их сорок, пока обложек
 * нет.
 */
export function MusicArtistBubble({ artist }: { artist: MusicArtistDto }) {
  return (
    <Link
      href={`/music/artists/${artist.slug}`}
      className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 text-center sm:w-24 sm:gap-2"
    >
      {/* На телефоне кружок меньше: витрина там в два ряда по четыре-пять
          исполнителей (VED-103), и при прежних 68px в ширину входило три. */}
      <span className="relative size-14 overflow-hidden rounded-full sm:size-[68px]">
        <MusicCover
          url={artist.coverUrl}
          seed={artist.id}
          alt={`Фото: ${artist.name}`}
          rounded="rounded-full"
          placeholderLabel={
            <span className="font-mono text-base font-bold text-text-0 sm:text-lg">
              {artist.trackCount}
            </span>
          }
        />
        {/* С обложкой число — маленькой меткой поверх неё. */}
        {artist.coverUrl && (
          <span
            aria-hidden
            className="absolute bottom-0 right-0 rounded-full bg-bg-0/85 px-1.5 font-mono text-[11px] font-bold text-text-0"
          >
            {artist.trackCount}
          </span>
        )}
      </span>
      <span className="line-clamp-2 break-words text-xs font-semibold leading-tight text-text-0">
        {artist.name}
        {/* Слово «записей» под кружком убрано (VED-516): число стоит в самом
            кружке, а скринридеру оно нужно словами. */}
        <span className="sr-only">
          , {artist.trackCount}{" "}
          {plural(artist.trackCount, "запись", "записи", "записей")}
        </span>
      </span>
    </Link>
  );
}
