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
      className="flex w-24 shrink-0 flex-col items-center gap-2 text-center"
    >
      <span className="relative h-[68px] w-[68px] overflow-hidden rounded-full">
        <MusicCover
          url={artist.coverUrl}
          seed={artist.id}
          alt={`Фото: ${artist.name}`}
          rounded="rounded-full"
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold leading-tight text-text-0">
          {artist.name}
        </span>
        <span className="font-mono text-[11px] text-text-2">
          {artist.trackCount}{" "}
          {plural(artist.trackCount, "запись", "записи", "записей")}
        </span>
      </span>
    </Link>
  );
}
