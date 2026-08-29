"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatBytes } from "@/lib/music/offline-capacity";
import {
  listOfflineTracks,
  openMusicDb,
  deleteOfflineTrack,
} from "@/lib/music/offline-db";
import { plural } from "@/lib/plural";
import { useMusicPlayer } from "./player/player-provider";

/**
 * Сколько занято на устройстве — в настройках сервиса. См.
 * docs/music-service-plan.md, этап 9.
 *
 * Место кончается молча: браузер не спрашивает, он вытесняет. Поэтому цифра
 * должна лежать там же, где остальные настройки прослушивания, а не только
 * на самой странице сохранённого.
 */
export function MusicOfflineUsage() {
  const player = useMusicPlayer();
  const userId = player?.offlineUserId ?? null;
  const [count, setCount] = useState<number | null>(null);
  const [bytes, setBytes] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    const db = await openMusicDb(userId);
    const items = await listOfflineTracks(db);
    setCount(items.length);
    setBytes(items.reduce((sum, item) => sum + item.sizeBytes, 0));
  }, [userId]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       чтение IndexedDB: состояние заполняется после await, а не синхронно.
       Та же оговорка, что в offline-list и player-provider. */
    void reload();
  }, [reload]);

  const clearAll = async () => {
    if (!userId) return;
    const db = await openMusicDb(userId);
    const items = await listOfflineTracks(db);
    for (const item of items) await deleteOfflineTrack(db, item.trackId);
    setConfirming(false);
    await reload();
  };

  // Ни строки, ни места она не занимает, пока сохранять нечего.
  if (!userId || count === null || count === 0) return null;

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <h2 className="font-display text-base font-bold text-text-0">
        На устройстве
      </h2>
      <p className="text-sm text-text-1">
        {count} {plural(count, "запись", "записи", "записей")} · занято{" "}
        {formatBytes(bytes)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/music/offline"
          className="flex h-9 items-center rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0"
        >
          Посмотреть
        </Link>

        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => void clearAll()}
              className="flex h-9 items-center rounded-lg border border-magenta/50 px-3 text-sm font-semibold text-magenta"
            >
              Убрать всё
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-9 items-center rounded-lg px-3 text-sm text-text-2 hover:text-magenta"
          >
            Освободить место
          </button>
        )}
      </div>
    </section>
  );
}
