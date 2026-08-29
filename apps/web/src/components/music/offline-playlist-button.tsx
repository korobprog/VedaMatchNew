"use client";

import { useEffect, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import {
  isTrackSavedOffline,
  saveTrackOffline,
} from "@/lib/music/offline-manager";
import { useMusicPlayer } from "./player/player-provider";

type State =
  | { kind: "unknown" }
  | { kind: "idle"; savedCount: number }
  | { kind: "saving"; done: number; total: number }
  | { kind: "failed"; done: number; total: number; message: string };

/**
 * «Сохранить весь плейлист». См. docs/music-service-plan.md, этап 9.
 *
 * Качаем по одной записи, а не всё разом: параллельная выкачка десятка
 * киртанов забивает канал так, что не грузится и сама страница, а прогресс
 * по каждой в отдельности человеку не нужен — ему нужно «сколько осталось».
 *
 * Уже сохранённые пропускаем: докачать прерванный плейлист — обычное дело,
 * и заставлять человека качать заново то, что уже лежит, незачем.
 *
 * Первая же неудача останавливает: самая частая причина — кончилось место, и
 * упрямо продолжать значит десять раз показать одну и ту же ошибку.
 */
export function MusicOfflinePlaylistButton({
  tracks,
}: {
  tracks: MusicTrackDto[];
}) {
  const player = useMusicPlayer();
  const userId = player?.offlineUserId ?? null;
  const [state, setState] = useState<State>({ kind: "unknown" });

  useEffect(() => {
    if (!userId || tracks.length === 0) return;
    let alive = true;
    void Promise.all(
      tracks.map((track) => isTrackSavedOffline(userId, track.id)),
    )
      .then((flags) => {
        if (alive) {
          setState({ kind: "idle", savedCount: flags.filter(Boolean).length });
        }
      })
      .catch(() => alive && setState({ kind: "idle", savedCount: 0 }));
    return () => {
      alive = false;
    };
  }, [userId, tracks]);

  if (!userId || tracks.length === 0 || state.kind === "unknown") return null;

  const saveAll = async () => {
    const pending: MusicTrackDto[] = [];
    for (const track of tracks) {
      if (!(await isTrackSavedOffline(userId, track.id))) pending.push(track);
    }
    if (pending.length === 0) {
      setState({ kind: "idle", savedCount: tracks.length });
      return;
    }

    let done = 0;
    setState({ kind: "saving", done, total: pending.length });
    for (const track of pending) {
      try {
        await saveTrackOffline(userId, track);
        done += 1;
        setState({ kind: "saving", done, total: pending.length });
      } catch (cause) {
        setState({
          kind: "failed",
          done,
          total: pending.length,
          message: (cause as Error).message,
        });
        return;
      }
    }
    setState({ kind: "idle", savedCount: tracks.length });
  };

  const shell =
    "flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors";

  if (state.kind === "saving") {
    return (
      <span role="status" className={`${shell} border-glass-brd text-text-1`}>
        Сохраняем… {state.done} из {state.total}
      </span>
    );
  }

  const allSaved = state.kind === "idle" && state.savedCount === tracks.length;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void saveAll()}
        disabled={allSaved}
        className={`${shell} ${
          allSaved
            ? "border-cyan/40 text-cyan"
            : "border-glass-brd text-text-1 hover:text-text-0"
        } disabled:cursor-default`}
      >
        {allSaved
          ? "Плейлист на устройстве"
          : state.kind === "idle" && state.savedCount > 0
            ? `Дослушать без сети: осталось ${tracks.length - state.savedCount}`
            : "Сохранить плейлист на устройство"}
      </button>

      {state.kind === "failed" && (
        <p role="alert" className="text-xs text-magenta">
          Сохранили {state.done} из {state.total} и остановились: {state.message}
        </p>
      )}
    </div>
  );
}
