"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicArtistDto, MusicTrackDetailDto } from "@vedamatch/shared";
import { updateMusicTrack } from "@/lib/music-admin-client-api";
import {
  buildTrackEditPatch,
  type MusicTrackEditState,
} from "@/lib/music-track-edit";
import { MusicCoverField } from "./cover-field";

const fieldClass =
  "w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

function stateOf(track: MusicTrackDetailDto): MusicTrackEditState {
  return {
    title: track.title,
    artistId: track.artist?.id ?? "",
    lyrics: track.lyrics.lyrics ?? "",
    transliteration: track.lyrics.transliteration ?? "",
    translation: track.lyrics.translation ?? "",
  };
}

/**
 * Правка записи прямо в карточке — для редакции Музыки (VED-102, VED-109).
 *
 * Название и исполнителя раньше можно было поправить только в админке, а
 * текст бхаджана и картинку записи — нигде: колонки в базе были, формы не
 * было. Редакция замечает опечатку, когда слушает, то есть здесь, и уходить
 * ради неё в админку и искать запись в списке — лишний круг.
 *
 * Свёрнуто по умолчанию: карточку открывают слушать, и форма на полэкрана
 * мешала бы самой редакции.
 */
export function MusicTrackAdminEditor({
  track,
  artists,
}: {
  track: MusicTrackDetailDto;
  artists: MusicArtistDto[];
}) {
  const router = useRouter();
  const initial = stateOf(track);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MusicTrackEditState>(initial);
  /** `undefined` — картинку не трогали, см. `buildTrackEditPatch`. */
  const [coverKey, setCoverKey] = useState<string | null | undefined>(
    undefined,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patch = buildTrackEditPatch(initial, draft, coverKey);
  const changed = Object.keys(patch).length > 0;

  function set<K extends keyof MusicTrackEditState>(key: K, value: string) {
    setDraft((was) => ({ ...was, [key]: value }));
    setSaved(false);
  }

  function cancel() {
    setDraft(stateOf(track));
    setCoverKey(undefined);
    setError(null);
    setOpen(false);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateMusicTrack(track.id, patch);
      setCoverKey(undefined);
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDraft(stateOf(track));
            setOpen(true);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          Редактировать запись
        </button>
        {saved && (
          <span role="status" className="text-xs text-cyan">
            Сохранено
          </span>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Правка записи"
      className="glass mt-6 rounded-2xl border border-glass-brd p-4"
    >
      <h2 className="font-display text-base font-bold text-text-0">
        Правка записи
      </h2>
      <p className="mt-1 text-xs text-text-2">
        Видно только редакции Музыки. Изменения сразу видят все слушатели.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={200}
            className={`${fieldClass} h-9`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
          <select
            value={draft.artistId}
            onChange={(event) => set("artistId", event.target.value)}
            className={`${fieldClass} h-9`}
          >
            <option value="">Не указан</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <MusicCoverField
          scope="track"
          value={coverKey ?? null}
          onChange={setCoverKey}
          label="Картинка записи — без неё показывается обложка альбома или исполнителя"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {(
          [
            ["lyrics", "Текст бхаджана"],
            ["transliteration", "Транслитерация"],
            ["translation", "Перевод"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs text-text-2">{label}</span>
            <textarea
              value={draft[key]}
              onChange={(event) => set(key, event.target.value)}
              rows={8}
              className={`${fieldClass} py-2 font-body leading-relaxed`}
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!changed || pending}
          onClick={() => void save()}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={cancel}
          className="h-9 rounded-xl px-3 text-sm text-text-2 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </section>
  );
}
