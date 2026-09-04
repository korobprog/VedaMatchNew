"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  MusicAlbumDto,
  MusicArtistDto,
  MusicIngestItemDto,
  UpdateMusicIngestBatchRequest,
} from "@vedamatch/shared";
import {
  deleteIngestItem,
  updateMusicTrack,
} from "@/lib/music-admin-client-api";
import { Alert } from "@/components/ui/alert";

/**
 * Состояние доставки — словом. Цвет рамки его дублирует, но не заменяет:
 * «ошибка» и «готово» должны различаться и на монохромном экране, и у того,
 * кто не различает красное и зелёное.
 */
const STATUS_LABELS: Record<MusicIngestItemDto["status"], string> = {
  waiting: "ждёт",
  fetching: "качается",
  stored: "готово",
  skipped: "пропущено",
  failed: "ошибка",
};

const STATUS_BORDERS: Record<MusicIngestItemDto["status"], string> = {
  waiting: "border-glass-brd",
  fetching: "border-cyan/60",
  stored: "border-mint/60",
  skipped: "border-glass-brd",
  failed: "border-magenta/60",
};

const SOURCE_LABELS: Record<MusicIngestItemDto["source"], string> = {
  upload: "файл",
  url: "ссылка",
  zip: "архив",
};

const field =
  "h-9 w-full min-w-40 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Таблица позиций партии.
 *
 * Без роутера и без запросов: строку правит и сохраняет вызывающий. Так её
 * можно отрисовать в тесте одним `render` и так же спокойно переиспользовать
 * на будущей странице просмотра опубликованной партии.
 */
export function IngestItemsTable({
  items,
  onApplyToSelected,
  artists = [],
  albums = [],
  onSaved,
  onRemove,
  busy = false,
}: {
  items: MusicIngestItemDto[];
  /** Проставить полям отмеченных позиций значения из шапки партии. */
  onApplyToSelected: (itemIds: string[]) => void;
  artists?: MusicArtistDto[];
  albums?: MusicAlbumDto[];
  /** Строка сохранилась — вызывающий обновляет страницу. */
  onSaved?: () => void;
  onRemove?: (itemId: string) => void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = useMemo(
    () => items.map((item) => item.id),
    [items],
  );
  const allChecked =
    selectable.length > 0 && selectable.every((id) => selected.has(id));

  function toggle(id: string): void {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-2">
        В партии пока пусто. Добавьте файлы, ссылки или архив выше.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={allChecked}
            aria-label="Отметить все позиции"
            onChange={(event) =>
              setSelected(
                event.target.checked ? new Set(selectable) : new Set(),
              )
            }
            className="size-4"
          />
          Все
        </label>
        <button
          type="button"
          disabled={selected.size === 0 || busy}
          onClick={() =>
            onApplyToSelected(selectable.filter((id) => selected.has(id)))
          }
          className="h-9 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          Применить к отмеченным
        </button>
        <span className="text-xs text-text-2">
          Исполнитель, альбом, разделы и язык из шапки партии проставятся
          отмеченным записям.
        </span>
      </div>

      {/* Таблица шире экрана телефона — прокручивается сама, а не тянет за
          собой страницу. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-brd text-xs text-text-2">
              <th scope="col" className="w-8 px-1 py-2">
                <span className="sr-only">Отметка</span>
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                Откуда
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                Состояние
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                Название
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                Исполнитель
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                Альбом
              </th>
              <th scope="col" className="w-10 px-1 py-2">
                <span className="sr-only">Убрать</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                artists={artists}
                albums={albums}
                onSaved={onSaved}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  checked,
  onToggle,
  artists,
  albums,
  onSaved,
  onRemove,
}: {
  item: MusicIngestItemDto;
  checked: boolean;
  onToggle: () => void;
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  onSaved?: () => void;
  onRemove?: (itemId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const track = item.track;

  async function save(patch: {
    title?: string;
    artistId?: string | null;
    albumId?: string | null;
  }): Promise<void> {
    if (!track) return;
    setError(null);
    try {
      await updateMusicTrack(track.id, patch);
      onSaved?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось сохранить",
      );
    }
  }

  return (
    <tr className="border-b border-glass-brd/60 align-top">
      <td className="px-1 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={item.sourceRef}
          className="mt-2 size-4"
        />
      </td>
      <td className="max-w-64 px-2 py-2">
        <span className="block truncate text-sm text-text-0" title={item.sourceRef}>
          {item.sourceRef}
        </span>
        <span className="block text-xs text-text-2">
          {SOURCE_LABELS[item.source]}
        </span>
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex h-6 items-center rounded-full border px-2 text-xs text-text-0 ${STATUS_BORDERS[item.status]}`}
        >
          {STATUS_LABELS[item.status]}
        </span>
        {item.failureReason && (
          <span className="mt-1 block max-w-64 text-xs text-text-1">
            {item.failureReason}
          </span>
        )}
        {/* Дубль — не отказ: запись уже в каталоге, и полезнее ссылка на неё,
            чем объяснение, почему позицию не взяли. */}
        {item.duplicateOfTrackId && (
          <Link
            href={`/music/tracks/${item.duplicateOfTrackId}`}
            className="mt-1 block text-xs text-text-1 underline underline-offset-2 hover:text-text-0"
          >
            уже есть в каталоге
          </Link>
        )}
      </td>
      <td className="px-2 py-2">
        {track ? (
          <input
            defaultValue={track.title}
            aria-label={`Название: ${item.sourceRef}`}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== track.title) void save({ title: value });
            }}
            className={field}
          />
        ) : (
          <span className="text-xs text-text-2">появится после приёма</span>
        )}
      </td>
      <td className="px-2 py-2">
        {track ? (
          <select
            defaultValue={track.artist?.id ?? ""}
            aria-label={`Исполнитель: ${item.sourceRef}`}
            onChange={(event) =>
              void save({ artistId: event.target.value || null })
            }
            className={field}
          >
            <option value="">не указан</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-text-2">—</span>
        )}
      </td>
      <td className="px-2 py-2">
        {track ? (
          <select
            defaultValue={track.album?.id ?? ""}
            aria-label={`Альбом: ${item.sourceRef}`}
            onChange={(event) =>
              void save({ albumId: event.target.value || null })
            }
            className={field}
          >
            <option value="">не указан</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-text-2">—</span>
        )}
        {error && (
          <span className="mt-1 block">
            <Alert tone="error">{error}</Alert>
          </span>
        )}
      </td>
      <td className="px-1 py-2">
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Убрать «${item.sourceRef}» из партии`}
            className="flex size-8 items-center justify-center rounded-lg text-text-2 transition-colors hover:text-magenta motion-reduce:transition-none"
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
        )}
      </td>
    </tr>
  );
}

/**
 * Позиции партии вместе с запросами: массовое действие и удаление строки.
 *
 * Отдельно от таблицы, потому что серверная страница не может передать вниз
 * функцию — а таблица без роутера и без клиента остаётся проверяемой.
 */
export function IngestItems({
  batchId,
  items,
  artists,
  albums,
  defaults,
}: {
  batchId: string;
  items: MusicIngestItemDto[];
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  /** Что проставляем отмеченным: шапка партии. */
  defaults: Pick<
    UpdateMusicIngestBatchRequest,
    "artistId" | "albumId" | "categoryIds" | "language" | "isLiveRecording"
  >;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlight = items.some(
    (item) => item.status === "waiting" || item.status === "fetching",
  );

  /**
   * Пока сервер качает и читает теги, страница обновляется сама.
   *
   * Иначе редактор смотрит на «качается» и не знает, идёт ли работа: приём
   * занимает секунды, а F5 после каждой заливки — ровно тот случай, когда
   * человек решает, что раздел сломан. Опроса нет, когда качать нечего.
   */
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  async function applyToSelected(itemIds: string[]): Promise<void> {
    const chosen = items.filter(
      (item) => itemIds.includes(item.id) && item.track,
    );
    if (chosen.length === 0) {
      setError("У отмеченных позиций пока нет карточек — нечего править.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      for (const item of chosen) {
        await updateMusicTrack(item.track!.id, {
          artistId: defaults.artistId ?? null,
          albumId: defaults.albumId ?? null,
          categoryIds: defaults.categoryIds ?? [],
          language: defaults.language ?? null,
          isLiveRecording: defaults.isLiveRecording ?? false,
        });
      }
      setNote(`Поля партии проставлены: ${chosen.length}.`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось применить",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await deleteIngestItem(batchId, itemId);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось убрать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <IngestItemsTable
        items={items}
        onApplyToSelected={(ids) => void applyToSelected(ids)}
        artists={artists}
        albums={albums}
        onSaved={() => router.refresh()}
        onRemove={(id) => void remove(id)}
        busy={busy}
      />
      {note && <Alert tone="success">{note}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
