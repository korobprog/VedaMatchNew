"use client";

import { useEffect, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import { formatBytes } from "@/lib/music/offline-capacity";
import {
  isTrackSavedOffline,
  removeTrackOffline,
  saveTrackOffline,
} from "@/lib/music/offline-manager";
import { useMusicPlayer } from "./player/player-provider";

type State =
  | { kind: "unknown" }
  | { kind: "absent" }
  | { kind: "saving"; percent: number | null }
  | { kind: "saved"; sizeBytes: number }
  | { kind: "error"; message: string };

/**
 * «Сохранить на устройство». См. docs/music-service-plan.md, этап 9.
 *
 * Кнопка, а не автоматика: киртан весит от шестидесяти мегабайт, и молча
 * складывать на телефон всё прослушанное — это съесть гигабайты без спроса.
 * Так же устроены книги Библиотеки.
 *
 * Скачанного файла человеку не отдаём: копия живёт внутри портала и уходит
 * вместе с записью, если её снимут. Кнопки «скачать» по-прежнему нет — это
 * решение плана, а не недоделка.
 */
export function MusicOfflineButton({ track }: { track: MusicTrackDto }) {
  const player = useMusicPlayer();
  const userId = player?.offlineUserId ?? null;
  const [state, setState] = useState<State>({ kind: "unknown" });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void isTrackSavedOffline(userId, track.id)
      .then((saved) => {
        if (alive) setState(saved ? { kind: "saved", sizeBytes: 0 } : { kind: "absent" });
      })
      .catch(() => alive && setState({ kind: "absent" }));
    return () => {
      alive = false;
    };
  }, [userId, track.id]);

  // Хранилище недоступно (гость, приватный режим) — кнопки нет вовсе:
  // неактивная кнопка без объяснения хуже её отсутствия.
  if (!userId || state.kind === "unknown") return null;

  const save = async () => {
    setState({ kind: "saving", percent: null });
    try {
      const record = await saveTrackOffline(userId, track, (progress) => {
        setState({
          kind: "saving",
          percent: progress.totalBytes
            ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100)
            : null,
        });
      });
      setState({ kind: "saved", sizeBytes: record.sizeBytes });
    } catch (cause) {
      setState({ kind: "error", message: (cause as Error).message });
    }
  };

  const remove = async () => {
    try {
      await removeTrackOffline(userId, track.id);
      setState({ kind: "absent" });
    } catch (cause) {
      setState({ kind: "error", message: (cause as Error).message });
    }
  };

  const shell =
    "flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors";

  if (state.kind === "saving") {
    return (
      <span
        role="status"
        className={`${shell} border-glass-brd text-text-1`}
      >
        <Spinner />
        {state.percent === null
          ? "Сохраняем…"
          : `Сохраняем… ${Math.round(state.percent)}%`}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {state.kind === "saved" ? (
          <button
            type="button"
            onClick={() => void remove()}
            className={`${shell} border-cyan/40 text-cyan hover:text-text-0`}
          >
            <CheckIcon />
            На устройстве
            {state.sizeBytes > 0 && (
              <span className="font-mono text-[11px] text-text-2">
                {formatBytes(state.sizeBytes)}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            className={`${shell} border-glass-brd text-text-1 hover:text-text-0`}
          >
            <DownIcon />
            Сохранить на устройство
          </button>
        )}
      </div>

      {state.kind === "error" && (
        <p role="alert" className="text-xs text-magenta">
          {state.message}
        </p>
      )}

      {state.kind === "saved" && (
        // Обещать «навсегда» нельзя: Safari на iOS чистит хранилище примерно
        // после недели без открытия, если портал не установлен приложением.
        // Честнее сказать это здесь, чем разбираться потом, куда всё делось.
        <p className="text-xs text-text-2">
          Играет без сети. На iPhone сохранится надёжнее, если добавить портал
          на домашний экран.
        </p>
      )}
    </div>
  );
}

function DownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 text-violet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 19h16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 animate-spin text-violet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
