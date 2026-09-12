"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMusicAlbum,
  deleteMusicArtist,
  deleteMusicCategory,
  updateMusicAlbum,
  updateMusicArtist,
  updateMusicCategory,
} from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";
import { MusicCover } from "@/components/music/music-cover";
import { MusicCoverField } from "@/components/music/cover-field";

export type MusicReferenceKind = "artist" | "album" | "category";

export interface MusicReferenceRow {
  id: string;
  primary: string;
  secondary: string;
  badge: string | null;
  /** Обложка, если она уже есть. У разделов каталога обложек не бывает. */
  coverUrl?: string | null;
}

/**
 * Список справочника с правкой и удалением.
 *
 * До этого список был только для чтения: API умел `PATCH` и `DELETE` с
 * самого начала, но клиент звал одни `create*`, и опечатку в имени
 * исполнителя нельзя было исправить ничем, кроме запроса в базу.
 *
 * Переименование идёт на месте, а не в отдельном окне: правится ровно одно
 * поле, и модальное окно ради одной строки — лишний шаг. Слаг не трогаем,
 * его держит сервер: адрес, разъезжающийся с названием на каждой правке,
 * ломает уже разосланные ссылки.
 *
 * Удаление в два нажатия и без `confirm()`: системное окно не переживает
 * тему портала и не объясняет, что именно исчезнет. Ответ сервера — почему
 * не вышло («сначала перевесьте записи») — показывается прямо в строке.
 *
 * Обложка правится здесь же (VED-19). Раньше её можно было задать только при
 * создании карточки: у заведённого исполнителя картинку было не поменять
 * ничем, а альбом без обложки так и оставался серым. Сервер это умел с самого
 * начала — не хватало кнопки.
 */
export function MusicReferenceList({
  title,
  empty,
  kind,
  rows,
}: {
  title: string;
  empty: string;
  kind: MusicReferenceKind;
  rows: MusicReferenceRow[];
}) {
  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h3 className="mb-3 font-display text-base font-bold text-text-0">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-2">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <Row key={row.id} row={row} kind={kind} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row, kind }: { row: MusicReferenceRow; kind: MusicReferenceKind }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "confirm" | "cover">(
    "view",
  );
  const [name, setName] = useState(row.primary);
  /* Ключ новой обложки и признак «её трогали». Без второго нажатие
     «Сохранить» сразу после открытия сняло бы обложку, которая уже стоит. */
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [coverTouched, setCoverTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      setMode("view");
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  const rename = () => {
    const next = name.trim();
    if (!next || next === row.primary) {
      setMode("view");
      return;
    }
    void run(() =>
      kind === "artist"
        ? updateMusicArtist(row.id, { name: next })
        : kind === "album"
          ? updateMusicAlbum(row.id, { title: next })
          : updateMusicCategory(row.id, { title: next }),
    );
  };

  /** Обложка есть только у исполнителя и альбома: раздел каталога — просто имя. */
  const coverScope = kind === "artist" ? "artist" : "album";
  const saveCover = () =>
    void run(() =>
      kind === "artist"
        ? updateMusicArtist(row.id, { coverKey })
        : updateMusicAlbum(row.id, { coverKey }),
    );

  const remove = () =>
    void run(() =>
      kind === "artist"
        ? deleteMusicArtist(row.id)
        : kind === "album"
          ? deleteMusicAlbum(row.id)
          : deleteMusicCategory(row.id),
    );

  const iconButton =
    "flex size-8 shrink-0 items-center justify-center rounded-lg text-text-2 transition-colors hover:text-text-0 disabled:opacity-40";

  return (
    <li className="rounded-lg px-1 py-1.5">
      {mode === "rename" ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename();
              if (event.key === "Escape") {
                setName(row.primary);
                setMode("view");
              }
            }}
            maxLength={120}
            aria-label={`Название: ${row.primary}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0"
          />
          <button
            type="button"
            onClick={rename}
            disabled={pending}
            className="btn-mint h-9 shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              setName(row.primary);
              setMode("view");
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : mode === "cover" ? (
        <div className="flex flex-col gap-2">
          <MusicCoverField
            scope={coverScope}
            value={coverKey}
            onChange={(next) => {
              setCoverKey(next);
              setCoverTouched(true);
            }}
            label={`Обложка: ${row.primary}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveCover}
              /* Пока обложку не трогали, сохранять нечего: иначе нажатие
                 сразу после открытия сняло бы ту, что уже стоит. */
              disabled={pending || !coverTouched}
              className="btn-mint h-9 shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setCoverKey(null);
                setCoverTouched(false);
                setMode("view");
                setError(null);
              }}
              className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : mode === "confirm" ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-text-1">
            Удалить «{row.primary}» безвозвратно?
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
              setMode("view");
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          {kind !== "category" && (
            <span
              aria-hidden
              className="size-9 shrink-0 self-center overflow-hidden rounded-lg border border-glass-brd"
            >
              <MusicCover url={row.coverUrl ?? null} seed={row.id} alt="" rounded="rounded-lg" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-0">
              {row.primary}
            </span>
            <span className="block truncate text-xs text-text-2">
              {row.secondary}
            </span>
          </span>
          {row.badge && (
            <span className="shrink-0 self-center rounded-full border border-cyan/40 px-2 text-[11px] text-cyan">
              {row.badge}
            </span>
          )}
          {kind !== "category" && (
            <button
              type="button"
              onClick={() => setMode("cover")}
              aria-label={`Обложка «${row.primary}»`}
              className={`${iconButton} self-center`}
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("rename")}
            aria-label={`Переименовать «${row.primary}»`}
            className={`${iconButton} self-center`}
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
          <button
            type="button"
            onClick={() => setMode("confirm")}
            aria-label={`Удалить «${row.primary}»`}
            className={`${iconButton} self-center hover:text-magenta`}
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
