"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MusicAdminPlaylistDto, MusicTrackDto } from "@vedamatch/shared";
import {
  addTrackToMusicSystemPlaylist,
  createMusicSystemPlaylist,
  deleteMusicSystemPlaylist,
  removeTrackFromMusicSystemPlaylist,
} from "@/lib/music-admin-client-api";
import { MusicCoverField } from "@/components/music/cover-field";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";

const field =
  "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Подборки портала — «Утренний киртан», «Вечерняя арати», «Фон для джапы».
 *
 * Живут в тех же таблицах, что личные плейлисты, но заводятся только здесь:
 * витрина показывает их всем, и личный плейлист, случайно ставший общим, —
 * это чужая подборка на главной странице сервиса.
 *
 * Наполнение — списком опубликованных записей с галочками, а не поиском:
 * каталог редакции обозрим, а поиск по нему нужен тогда, когда записей станет
 * больше, чем помещается глазами. До тех пор он был бы лишним экраном.
 */
export function MusicSystemPlaylists({
  playlists,
  tracks,
  membership,
}: {
  playlists: MusicAdminPlaylistDto[];
  /** Опубликованный каталог: только его можно класть в общую подборку. */
  tracks: MusicTrackDto[];
  /** Что уже внутри: id подборки → id записей. */
  membership: Record<string, string[]>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <NewPlaylistForm />

      {playlists.length === 0 ? (
        <p className="text-sm text-text-1">
          Подборок пока нет. Витрина каталога показывает этот блок, только когда
          в нём что-то есть.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <PlaylistCard
                playlist={playlist}
                tracks={tracks}
                inside={new Set(membership[playlist.id] ?? [])}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewPlaylistForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await createMusicSystemPlaylist({
        title: title.trim(),
        description: description.trim() || null,
        coverKey,
      });
      setTitle("");
      setDescription("");
      setCoverKey(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <h3 className="font-display text-base font-bold text-text-0">
        Новая подборка
      </h3>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">Название</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={field}
          placeholder="Утренний киртан"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">
          Подпись — зачем эта подборка
        </span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={field}
          placeholder="С чего начать день"
        />
      </label>
      <MusicCoverField
        scope="playlist"
        value={coverKey}
        onChange={setCoverKey}
      />
      <button
        type="button"
        disabled={pending || !title.trim()}
        onClick={() => void submit()}
        className="btn-mint h-9 self-start rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
      >
        Создать
      </button>
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

function PlaylistCard({
  playlist,
  tracks,
  inside,
}: {
  playlist: MusicAdminPlaylistDto;
  tracks: MusicTrackDto[];
  inside: Set<string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(trackId: string, wanted: boolean) {
    setBusy(trackId);
    setError(null);
    try {
      if (wanted) await addTrackToMusicSystemPlaylist(playlist.id, trackId);
      else await removeTrackFromMusicSystemPlaylist(playlist.id, trackId);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("playlist");
    setError(null);
    try {
      await deleteMusicSystemPlaylist(playlist.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-base font-bold text-text-0">
          <Link
            href={`/music/playlists/${playlist.id}`}
            className="hover:text-cyan"
          >
            {playlist.title}
          </Link>
        </h3>
        <span className="text-xs text-text-2">
          {playlist.trackCount}{" "}
          {plural(playlist.trackCount, "запись", "записи", "записей")}
        </span>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void remove()}
          className="ml-auto h-8 rounded-lg border border-glass-brd px-3 text-xs font-semibold text-text-2 hover:text-magenta disabled:opacity-50"
        >
          Удалить подборку
        </button>
      </div>

      {playlist.description && (
        <p className="text-xs text-text-2">{playlist.description}</p>
      )}

      {tracks.length === 0 ? (
        <p className="text-xs text-text-2">
          В каталоге пока нет опубликованных записей.
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {tracks.map((track) => {
            const checked = inside.has(track.id);
            return (
              <li key={track.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/4">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy !== null}
                    onChange={() => void toggle(track.id, !checked)}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-0">
                    {track.title}
                  </span>
                  <span className="shrink-0 truncate text-xs text-text-2">
                    {track.artist?.name ?? "Исполнитель не указан"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
