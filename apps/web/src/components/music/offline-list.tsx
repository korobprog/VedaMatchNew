"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatTrackDuration } from "@/lib/music-duration";
import { formatBytes } from "@/lib/music/offline-capacity";
import { listOfflineTracks, openMusicDb, type MusicOfflineTrack } from "@/lib/music/offline-db";
import { removeTrackOffline } from "@/lib/music/offline-manager";
import { MusicCover } from "./music-cover";
import { useMusicPlayer } from "./player/player-provider";

/**
 * Что лежит на устройстве. См. docs/music-service-plan.md, этап 9.
 *
 * Список собирается на клиенте из IndexedDB, а не приходит с сервера:
 * страница «на устройстве» обязана открываться именно тогда, когда сети нет
 * — иначе она бесполезна ровно в тот момент, ради которого затевалась.
 *
 * Карточка записи хранится рядом с блобом, поэтому названия и обложки видно
 * без сети тоже.
 */
export function MusicOfflineList() {
  const player = useMusicPlayer();
  const userId = player?.offlineUserId ?? null;
  const [rows, setRows] = useState<MusicOfflineTrack[] | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const db = await openMusicDb(userId);
    const items = await listOfflineTracks(db);
    setRows(items);
    setUsage(items.reduce((sum, item) => sum + item.sizeBytes, 0));
  }, [userId]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       IndexedDB и есть тот внешний источник, ради которого эффекты нужны:
       читать её на рендере нельзя, а состояние заполняется уже после
       await, а не синхронно. Тот же приём и с той же оговоркой применён в
       player-provider. */
    void reload();
  }, [reload]);

  if (!userId) return null;

  if (rows === null) {
    return <p className="text-sm text-text-2">Смотрим, что сохранено…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-1">
        Пока ничего. Откройте запись и нажмите «Сохранить на устройство» — она
        будет играть без сети.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-2">
        {rows.length}{" "}
        {rows.length === 1 ? "запись" : rows.length < 5 ? "записи" : "записей"}
        {usage !== null && ` · занято ${formatBytes(usage)}`}
      </p>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.trackId}
            className="glass flex items-center gap-3 rounded-2xl p-2.5"
          >
            <Link
              href={`/music/tracks/${row.trackId}`}
              aria-label={`Открыть запись: ${row.track.title}`}
              className="size-11 shrink-0 overflow-hidden rounded-xl"
            >
              <MusicCover
                url={row.track.coverUrl}
                seed={row.trackId}
                alt=""
                rounded="rounded-xl"
              />
            </Link>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-text-0">
                {row.track.title}
              </span>
              <span className="truncate text-xs text-text-2">
                {[
                  row.track.artist?.name,
                  formatTrackDuration(row.track.durationSeconds),
                  formatBytes(row.sizeBytes),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>

            <button
              type="button"
              aria-label={`Убрать с устройства: ${row.track.title}`}
              onClick={() => {
                void removeTrackOffline(userId, row.trackId).then(reload);
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-2 transition-colors hover:text-magenta"
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
          </li>
        ))}
      </ul>
    </div>
  );
}
