"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicArtistDto } from "@vedamatch/shared";
import { setMusicTracksArtist } from "@/lib/music-admin-client-api";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";
import { cleanArtistName, findArtistByName } from "./bulk-artist";

const recordsWord = (n: number) => plural(n, "запись", "записи", "записей");

/**
 * Панель массовой смены исполнителя (VED-226). Появляется над списком, когда
 * выбрана хотя бы одна запись.
 *
 * Имя вводят, а не выбирают: исправляют чаще всего как раз опечатку, и
 * нужного исполнителя в справочнике может ещё не быть. Подсказка из
 * справочника — `datalist`, а под полем словами сказано, что произойдёт:
 * записи уйдут к существующему или будет заведён новый. Сверка без учёта
 * регистра — та же, что на сервере.
 */
export function MusicBulkArtistBar({
  selectedIds,
  artists,
  onClear,
}: {
  selectedIds: string[];
  artists: MusicArtistDto[];
  onClear: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const count = selectedIds.length;
  const cleaned = cleanArtistName(name);
  const match = findArtistByName(artists, cleaned);

  async function apply(body: { artistName: string } | { artistId: null }) {
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const result = await setMusicTracksArtist({
        trackIds: selectedIds,
        ...body,
      });
      const what = `${result.updated} ${recordsWord(result.updated)}`;
      setDone(
        result.artist
          ? `${what} — теперь у исполнителя «${result.artist.name}»${
              result.created ? " (заведён новый)" : ""
            }.`
          : `${what} — исполнитель снят.`,
      );
      setOpen(false);
      setName("");
      onClear();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  if (count === 0) {
    return done ? (
      <div className="mb-3">
        <Alert tone="success">{done}</Alert>
      </div>
    ) : null;
  }

  return (
    <div
      role="region"
      aria-label="Действия с выбранными записями"
      className="mb-3 rounded-xl border border-glass-brd bg-bg-1/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-text-0">
          Выбрано: {count} {recordsWord(count)}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-9 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-text-0"
          >
            Сменить исполнителя
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            onClear();
          }}
          className="h-9 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
        >
          Снять выбор
        </button>
      </div>

      {open && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (cleaned && !pending) void apply({ artistName: cleaned });
          }}
        >
          <label htmlFor={inputId} className="mb-1 block text-xs text-text-2">
            Исполнитель для выбранных записей
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              list={listId}
              autoFocus
              autoComplete="off"
              maxLength={160}
              aria-describedby={hintId}
              placeholder="Имя из справочника или новое"
              className="h-9 w-full min-w-0 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0 sm:w-auto sm:max-w-sm sm:flex-1"
            />
            <datalist id={listId}>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.name} />
              ))}
            </datalist>
            <button
              type="submit"
              disabled={!cleaned || pending}
              className="h-9 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
            >
              {pending ? "Сохраняем…" : "Применить"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="h-9 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
            >
              Отмена
            </button>
          </div>
          <p id={hintId} aria-live="polite" className="mt-1.5 text-xs text-text-2">
            {!cleaned
              ? "Начните вводить — подскажем исполнителей из справочника."
              : match
                ? `Записи перейдут к существующему исполнителю «${match.name}».`
                : `Такого исполнителя нет — будет заведён новый: «${cleaned}».`}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void apply({ artistId: null })}
            className="mt-1 inline-flex min-h-6 items-center text-xs text-text-2 underline underline-offset-2 hover:text-text-0 disabled:opacity-50"
          >
            Снять исполнителя у выбранных
          </button>
        </form>
      )}

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
