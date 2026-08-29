"use client";

import { useState } from "react";
import Link from "next/link";
import type { MusicFriendPlaylistDto } from "@vedamatch/shared";
import { formatTotalDuration } from "@/lib/music-duration";
import { copyPlaylistToSelf } from "@/lib/music-playlists-api";
import { plural } from "@/lib/plural";
import { MusicCover } from "./music-cover";

/**
 * Чужой плейлист в списке «У друзей». См. docs/music-service-plan.md.
 *
 * Два действия, и они про разное. «Слушать» ставит плейлист в очередь, ничего
 * не копируя, — этого хватает в девяти случаях из десяти. «Себе» делает копию,
 * которую можно править: копия сразу отвязана от оригинала и всегда личная,
 * иначе чужая подборка расходилась бы по кругу без ведома того, кто её собрал.
 *
 * Копия не следит за оригиналом: дописал друг три киртана — у вас их нет. Для
 * «хочу быть в курсе» нужна подписка, и это отдельная работа.
 */
export function MusicFriendPlaylistCard({
  playlist,
}: {
  playlist: MusicFriendPlaylistDto;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "copied" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const copy = async () => {
    setState({ kind: "busy" });
    try {
      await copyPlaylistToSelf(playlist.id);
      setState({ kind: "copied" });
    } catch (cause) {
      setState({ kind: "error", message: (cause as Error).message });
    }
  };

  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <Link
          href={`/music/playlists/${playlist.id}`}
          aria-label={`Открыть плейлист: ${playlist.title}`}
          className="size-14 shrink-0 overflow-hidden rounded-xl"
        >
          <MusicCover
            url={playlist.coverUrl}
            seed={playlist.id}
            alt=""
            rounded="rounded-xl"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/music/playlists/${playlist.id}`}
            className="truncate text-sm font-semibold text-text-0 hover:text-cyan"
          >
            {playlist.title}
          </Link>
          <span className="truncate text-xs text-text-2">
            {playlist.owner.name}
          </span>
          <span className="truncate text-xs text-text-2">
            {playlist.trackCount}{" "}
            {plural(playlist.trackCount, "запись", "записи", "записей")}
            {playlist.totalSeconds > 0 &&
              ` · ${formatTotalDuration(playlist.totalSeconds)}`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/music/playlists/${playlist.id}`}
          className="btn-mint flex h-9 items-center rounded-lg px-3 text-sm font-semibold"
        >
          Слушать
        </Link>

        {state.kind === "copied" ? (
          <Link
            href="/music/playlists"
            className="flex h-9 items-center rounded-lg border border-cyan/40 px-3 text-sm font-semibold text-cyan"
          >
            Уже у вас — открыть
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void copy()}
            disabled={state.kind === "busy"}
            className="flex h-9 items-center rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            {state.kind === "busy" ? "Забираем…" : "Себе"}
          </button>
        )}
      </div>

      {state.kind === "error" && (
        <p role="alert" className="text-xs text-magenta">
          {state.message}
        </p>
      )}
    </li>
  );
}
