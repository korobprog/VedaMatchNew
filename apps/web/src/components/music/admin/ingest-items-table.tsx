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

const removeButton =
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-text-2 transition-colors hover:text-magenta motion-reduce:transition-none";

/** Правки строки: что сохраняем в черновике записи. */
type ItemPatch = {
  title?: string;
  artistId?: string | null;
  albumId?: string | null;
};

/**
 * Позиции партии.
 *
 * Без роутера и без запросов: строку правит и сохраняет вызывающий. Так её
 * можно отрисовать в тесте одним `render` и так же спокойно переиспользовать
 * на будущей странице просмотра опубликованной партии.
 *
 * Раскладок две. На широком экране — таблица: шесть полей в ряд читаются
 * колонками, и глазу есть за что зацепиться сверху вниз. На узком та же
 * таблица уезжала вбок, и редактор правил название, не видя, к какой записи
 * оно относится, — поэтому телефон получает карточки, как справочники и
 * очередь модерации рядом. Переключает CSS (`hidden md:block` и `md:hidden`),
 * а отметки, сохранение и ошибки живут здесь, в одном состоянии на обе:
 * раскладка — это оформление, а не вторая копия раздела.
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
  /** Отказ сервера — у позиции, а не у раскладки: показывают обе. */
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  async function save(
    item: MusicIngestItemDto,
    patch: ItemPatch,
  ): Promise<void> {
    const track = item.track;
    if (!track) return;
    setErrors((was) => {
      const next = { ...was };
      delete next[item.id];
      return next;
    });
    try {
      await updateMusicTrack(track.id, patch);
      onSaved?.();
    } catch (cause) {
      setErrors((was) => ({
        ...was,
        [item.id]:
          cause instanceof Error ? cause.message : "Не удалось сохранить",
      }));
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-2">
        В партии пока пусто. Добавьте файлы, ссылки или архив выше.
      </p>
    );
  }

  const rowProps = (item: MusicIngestItemDto) => ({
    item,
    checked: selected.has(item.id),
    onToggle: () => toggle(item.id),
    artists,
    albums,
    error: errors[item.id] ?? null,
    onSave: (patch: ItemPatch) => void save(item, patch),
    onRemove,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-6 items-center gap-2 text-sm text-text-1">
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

      {/* Телефон: та же позиция карточкой. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((item) => (
          <ItemCard key={item.id} {...rowProps(item)} />
        ))}
      </ul>

      {/* Широкий экран: колонки. Таблица всё ещё шире планшета —
          прокручивается сама, а не тянет за собой страницу. */}
      <div className="hidden overflow-x-auto md:block">
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
              <ItemRow key={item.id} {...rowProps(item)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Что нужно обеим раскладкам, чтобы нарисовать одну позицию. */
interface ItemViewProps {
  item: MusicIngestItemDto;
  checked: boolean;
  onToggle: () => void;
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  error: string | null;
  onSave: (patch: ItemPatch) => void;
  onRemove?: (itemId: string) => void;
}

/**
 * Отметка позиции.
 *
 * Чекбокс живёт в <label>-обёртке: сам он 16 px, а палец промахивается по
 * всему, что меньше 24. Отрицательный отступ возвращает обёртку на место,
 * чтобы увеличенная цель не сдвигала строку.
 */
function SelectBox({
  item,
  checked,
  onToggle,
}: Pick<ItemViewProps, "item" | "checked" | "onToggle">) {
  return (
    <label className="-m-1 flex size-8 shrink-0 cursor-pointer items-center justify-center p-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={item.sourceRef}
        className="size-4"
      />
    </label>
  );
}

/** Состояние словом плюс причина отказа или ссылка на дубль. */
function ItemStatus({ item }: { item: MusicIngestItemDto }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-xs text-text-0 ${STATUS_BORDERS[item.status]}`}
    >
      {STATUS_LABELS[item.status]}
    </span>
  );
}

function ItemVerdict({ item }: { item: MusicIngestItemDto }) {
  return (
    <>
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
          className="mt-1 inline-flex min-h-6 items-center text-xs text-text-1 underline underline-offset-2 hover:text-text-0"
        >
          уже есть в каталоге
        </Link>
      )}
    </>
  );
}

function TitleInput({
  item,
  onSave,
}: Pick<ItemViewProps, "item" | "onSave">) {
  const track = item.track!;
  return (
    <input
      defaultValue={track.title}
      aria-label={`Название: ${item.sourceRef}`}
      onBlur={(event) => {
        const value = event.target.value.trim();
        if (value && value !== track.title) onSave({ title: value });
      }}
      className={field}
    />
  );
}

function ArtistSelect({
  item,
  artists,
  onSave,
}: Pick<ItemViewProps, "item" | "artists" | "onSave">) {
  const track = item.track!;
  return (
    <select
      defaultValue={track.artist?.id ?? ""}
      aria-label={`Исполнитель: ${item.sourceRef}`}
      onChange={(event) => onSave({ artistId: event.target.value || null })}
      className={field}
    >
      <option value="">не указан</option>
      {artists.map((artist) => (
        <option key={artist.id} value={artist.id}>
          {artist.name}
        </option>
      ))}
    </select>
  );
}

function AlbumSelect({
  item,
  albums,
  onSave,
}: Pick<ItemViewProps, "item" | "albums" | "onSave">) {
  const track = item.track!;
  return (
    <select
      defaultValue={track.album?.id ?? ""}
      aria-label={`Альбом: ${item.sourceRef}`}
      onChange={(event) => onSave({ albumId: event.target.value || null })}
      className={field}
    >
      <option value="">не указан</option>
      {albums.map((album) => (
        <option key={album.id} value={album.id}>
          {album.title}
        </option>
      ))}
    </select>
  );
}

function RemoveButton({
  item,
  onRemove,
}: Pick<ItemViewProps, "item" | "onRemove">) {
  if (!onRemove) return null;
  return (
    <button
      type="button"
      onClick={() => onRemove(item.id)}
      aria-label={`Убрать «${item.sourceRef}» из партии`}
      className={removeButton}
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
  );
}

/**
 * Позиция карточкой — раскладка телефона.
 *
 * Подписи полей видны: без шапки таблицы «не указан» в двух списках подряд
 * ничем не отличается один от другого. Имя источника переносится целиком, а
 * не обрезается: у ссылки узнаваемая часть в конце, и многоточие вместо неё
 * оставляет редактора без единственной приметы позиции.
 */
function ItemCard({
  item,
  checked,
  onToggle,
  artists,
  albums,
  error,
  onSave,
  onRemove,
}: ItemViewProps) {
  return (
    <li className="rounded-xl border border-glass-brd p-3">
      <div className="flex items-start gap-2">
        <SelectBox item={item} checked={checked} onToggle={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm break-words text-text-0">
            {item.sourceRef}
          </span>
          <span className="block text-xs text-text-2">
            {SOURCE_LABELS[item.source]}
          </span>
        </span>
        <RemoveButton item={item} onRemove={onRemove} />
      </div>

      <div className="mt-2">
        <ItemStatus item={item} />
        <ItemVerdict item={item} />
      </div>

      {item.track ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">Название</span>
            <TitleInput item={item} onSave={onSave} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
            <ArtistSelect item={item} artists={artists} onSave={onSave} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">Альбом</span>
            <AlbumSelect item={item} albums={albums} onSave={onSave} />
          </label>
        </div>
      ) : (
        // Обещание «появятся» уместно, только пока приём впереди: у упавшей
        // и у пропущенной позиции карточки не будет никогда, и повторять им
        // это — врать.
        (item.status === "waiting" || item.status === "fetching") && (
          <p className="mt-2 text-xs text-text-2">
            Название, исполнитель и альбом появятся после приёма.
          </p>
        )
      )}

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}

/** Позиция строкой таблицы — раскладка широкого экрана. */
function ItemRow({
  item,
  checked,
  onToggle,
  artists,
  albums,
  error,
  onSave,
  onRemove,
}: ItemViewProps) {
  return (
    <tr className="border-b border-glass-brd/60 align-top">
      <td className="px-1 py-2">
        <span className="mt-1 flex">
          <SelectBox item={item} checked={checked} onToggle={onToggle} />
        </span>
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
        <ItemStatus item={item} />
        <ItemVerdict item={item} />
      </td>
      <td className="px-2 py-2">
        {item.track ? (
          <TitleInput item={item} onSave={onSave} />
        ) : (
          <span className="text-xs text-text-2">появится после приёма</span>
        )}
      </td>
      <td className="px-2 py-2">
        {item.track ? (
          <ArtistSelect item={item} artists={artists} onSave={onSave} />
        ) : (
          <span className="text-xs text-text-2">—</span>
        )}
      </td>
      <td className="px-2 py-2">
        {item.track ? (
          <AlbumSelect item={item} albums={albums} onSave={onSave} />
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
        <RemoveButton item={item} onRemove={onRemove} />
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
