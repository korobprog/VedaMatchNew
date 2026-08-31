"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicAdminTrackDto } from "@vedamatch/shared";
import { deleteMusicTrack } from "@/lib/music-admin-client-api";
import { formatBytes, formatTrackDuration } from "@/lib/music-duration";
import { Alert } from "@/components/ui/alert";

const STATUS_LABELS: Record<MusicAdminTrackDto["status"], string> = {
  draft: "черновик",
  pending: "ждёт проверки",
  published: "в каталоге",
  hidden: "скрыта",
  rejected: "отклонена",
};

/**
 * Все записи каталога — с удалением.
 *
 * До этого списка админка показывала только очередь, то есть `pending`:
 * опубликованную или отклонённую запись после решения увидеть было негде, а
 * убрать — нечем. «Скрыть» из очереди не считается: скрытая запись остаётся
 * в базе и продолжает занимать место в бакете.
 *
 * Поиск по названию — здесь, а не на сервере: список приходит целиком одной
 * страницей, и лишний круг до API ради подстроки был бы дороже самой
 * фильтрации.
 *
 * Удаление в два нажатия и без `confirm()` — тем же приёмом, что в
 * справочниках: системное окно не переживает тему портала и не объясняет,
 * что именно исчезнет. А исчезает здесь больше: вместе со строкой уходит
 * файл, и вернуть его нечем.
 */
export function MusicTrackList({
  tracks,
  total,
}: {
  tracks: MusicAdminTrackDto[];
  total: number;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter((track) =>
      [track.title, track.artistName, track.albumTitle]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [query, tracks]);

  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-text-0">
          Все записи
        </h3>
        <span className="font-mono text-xs text-text-2">
          {shown.length === tracks.length
            ? `${tracks.length} из ${total}`
            : `${shown.length} из ${tracks.length}`}
        </span>
      </div>

      {tracks.length === 0 ? (
        <p className="text-sm text-text-2">
          Записей пока нет. Они появятся здесь после загрузки — со вкладки
          «Справочники» или из сервиса.
        </p>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="sr-only">Поиск по названию</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, исполнитель, альбом"
              className="h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0 sm:max-w-sm"
            />
          </label>

          {shown.length === 0 ? (
            <p className="text-sm text-text-2">Ничего не нашлось.</p>
          ) : (
            <ul className="space-y-1">
              {shown.map((track) => (
                <TrackRow key={track.id} track={track} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TrackRow({ track }: { track: MusicAdminTrackDto }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteMusicTrack(track.id);
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить");
    } finally {
      setPending(false);
    }
  }

  const secondary = [
    track.artistName ?? "без исполнителя",
    track.albumTitle,
    formatTrackDuration(track.durationSeconds),
    formatBytes(track.sizeBytes),
    STATUS_LABELS[track.status],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-lg px-1 py-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-text-1">
            Удалить «{track.title}» вместе с файлом? Отменить будет нечем.
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="h-9 shrink-0 rounded-lg border border-magenta/50 px-3 text-sm font-semibold text-magenta disabled:opacity-50"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-0">
              {track.title}
            </span>
            <span className="block truncate text-xs text-text-2">
              {secondary}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Удалить «${track.title}»`}
            className="flex size-8 shrink-0 items-center justify-center self-center rounded-lg text-text-2 transition-colors hover:text-magenta"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-1.5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}
