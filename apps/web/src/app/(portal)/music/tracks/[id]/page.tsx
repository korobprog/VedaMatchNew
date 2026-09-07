import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMusicTrack } from "@/lib/music-api";
import { MusicCover } from "@/components/music/music-cover";
import { MusicReportForm } from "@/components/music/music-report-form";
import { MusicAddToPlaylist } from "@/components/music/music-add-to-playlist";
import { MusicOfflineButton } from "@/components/music/offline-button";
import { MusicSleepTimerButton } from "@/components/music/sleep-timer-button";
import { MusicTrackLyrics } from "@/components/music/music-track-lyrics";
import { MusicListenButton } from "@/components/music/player/listen-button";
import { MusicQueueActions } from "@/components/music/player/queue-actions";
import { formatTrackDuration } from "@/lib/music-duration";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const track = await getMusicTrack(id);
  if (!track) return { title: "Запись не найдена" };

  return {
    title: track.artist ? `${track.title} — ${track.artist.name}` : track.title,
  };
}

/**
 * Карточка записи. См. макет `.design/music/Track.dc.html`.
 *
 * Ссылка из ленты друзей и из полосы плеера приходит сюда с `?add=1`
 * («добавить себе в плейлист») и сразу открывает шторку. Параметр в адресе,
 * а не состояние кнопки, именно поэтому: компонент портала не имеет права
 * импортировать компоненты Музыки, и обе точки входа — обычные ссылки.
 *
 * `Suspense` вокруг кнопки обязателен: внутри `useSearchParams`, и без
 * границы Next роняет сборку страницы на предрендере.
 */
export default async function MusicTrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const track = await getMusicTrack(id);

  if (!track) notFound();

  const facts: { label: string; value: string }[] = [
    { label: "Длительность", value: formatTrackDuration(track.durationSeconds) },
    ...(track.bitrateKbps
      ? [{ label: "Битрейт", value: `${track.bitrateKbps} kbps` }]
      : []),
    ...(track.language ? [{ label: "Язык", value: track.language }] : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <Link
        href="/music"
        className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-text-0"
      >
        <span aria-hidden="true">←</span> Каталог
      </Link>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:gap-7">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-2xl sm:h-56 sm:w-56">
          <MusicCover
            url={track.coverUrl}
            seed={track.id}
            alt={`Обложка: ${track.title}`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            {track.title}
          </h1>

          {track.artist && (
            <Link
              href={`/music/artists/${track.artist.slug}`}
              className="text-base font-semibold text-cyan hover:text-magenta"
            >
              {track.artist.name}
            </Link>
          )}

          {track.album && (
            <Link
              href={`/music/albums/${track.album.slug}`}
              className="text-sm text-text-1 hover:text-text-0"
            >
              {track.album.title}
            </Link>
          )}

          <ul className="mt-1 flex flex-wrap gap-2">
            {track.categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/music?category=${category.slug}`}
                  className="flex h-8 items-center rounded-full border border-glass-brd px-3 text-xs font-semibold text-text-1 hover:text-text-0"
                >
                  {category.title}
                </Link>
              </li>
            ))}
            {track.isLiveRecording && (
              <li className="flex h-8 items-center rounded-full border border-glass-brd bg-glass px-3 text-xs font-semibold text-text-1">
                Запись с программы
              </li>
            )}
          </ul>

          <div className="mt-1 flex flex-col gap-2">
            {/* Первым и отдельно от остальных: это то, зачем страницу
                открывают, а «в плейлист» и «на устройство» — что делают с
                записью потом. */}
            <MusicListenButton trackId={track.id} title={track.title} />
            <Suspense fallback={<div className="h-11" />}>
              <MusicAddToPlaylist
                trackId={track.id}
                trackTitle={track.title}
                artistName={track.artist?.name ?? null}
              />
            </Suspense>
            <MusicQueueActions trackId={track.id} />
            <MusicOfflineButton track={track} />
            <MusicSleepTimerButton />
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col">
                <dt className="text-xs text-text-2">{fact.label}</dt>
                <dd className="font-mono text-sm text-text-0">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <MusicTrackLyrics lyrics={track.lyrics} />

      <MusicReportForm trackId={track.id} />
    </main>
  );
}
