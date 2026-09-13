"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMusicArtist } from "@/lib/music-admin-client-api";

/**
 * Переименование исполнителя на его странице — для редакции (VED-102).
 *
 * Имя из тегов приходит как придётся («AVANTIKA devi dasi (live)»), а
 * замечают это, открыв исполнителя в медиатеке. Адрес страницы при этом не
 * меняется: слаг сервер за именем не переписывает, по нему уже ушли ссылки.
 */
export function MusicArtistAdminRename({
  artistId,
  name,
}: {
  artistId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = value.trim();
  const changed = next.length > 0 && next !== name;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateMusicArtist(artistId, { name: next });
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
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setOpen(true);
        }}
        aria-label={`Переименовать исполнителя «${name}»`}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
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
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !pending) void save();
      }}
    >
      <label className="sr-only" htmlFor={`artist-name-${artistId}`}>
        Имя исполнителя
      </label>
      <input
        id={`artist-name-${artistId}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={200}
        autoFocus
        className="h-9 min-w-0 flex-1 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0"
      />
      <button
        type="submit"
        disabled={!changed || pending}
        className="btn-mint h-9 rounded-xl px-3 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(false);
        }}
        className="h-9 rounded-xl px-2 text-sm text-text-2 hover:text-text-0"
      >
        Отмена
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-magenta">
          {error}
        </p>
      )}
    </form>
  );
}
