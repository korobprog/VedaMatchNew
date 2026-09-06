"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MusicAdminTrackDto,
  MusicAlbumDto,
  MusicArtistDto,
  MusicCategoryDto,
  MusicTrackStatus,
} from "@vedamatch/shared";
import {
  deleteMusicTrack,
  updateMusicTrack,
} from "@/lib/music-admin-client-api";
import { formatBytes, formatTrackDuration } from "@/lib/music-duration";
import {
  LineageSelect,
  lineageFromSelect,
  lineageToSelect,
} from "@/components/lineage-picker";
import { Alert } from "@/components/ui/alert";

const STATUS_LABELS: Record<MusicAdminTrackDto["status"], string> = {
  draft: "черновик",
  pending: "ждёт проверки",
  published: "в каталоге",
  hidden: "скрыта",
  rejected: "отклонена",
};

const STATUS_OPTIONS: { value: MusicTrackStatus; label: string }[] = [
  { value: "published", label: "в каталоге" },
  { value: "hidden", label: "скрыта" },
  { value: "pending", label: "ждёт проверки" },
  { value: "rejected", label: "отклонена" },
  { value: "draft", label: "черновик" },
];

const field =
  "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Все записи каталога — с правкой и удалением.
 *
 * До этого списка админка показывала только очередь, то есть `pending`:
 * опубликованную или отклонённую запись после решения увидеть было негде, а
 * убрать — нечем. «Скрыть» из очереди не считается: скрытая запись остаётся
 * в базе и продолжает занимать место в бакете.
 *
 * Поиск по названию — здесь, а не на сервере: список приходит целиком одной
 * страницей, и лишний круг до API ради подстроки был бы дороже самой
 * фильтрации.
 *
 * Удаление в два нажатия и без `confirm()` — тем же приёмом, что в
 * справочниках: системное окно не переживает тему портала и не объясняет,
 * что именно исчезнет. А исчезает здесь больше: вместе со строкой уходит
 * файл, и вернуть его нечем.
 */
export function MusicTrackList({
  tracks,
  total,
  artists,
  albums,
  categories,
}: {
  tracks: MusicAdminTrackDto[];
  total: number;
  /** Справочники для полей правки — те же списки, что и в формах выше. */
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  categories: MusicCategoryDto[];
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter((track) =>
      [track.title, track.artistName, track.albumTitle]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [query, tracks]);

  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-text-0">
          Все записи
        </h3>
        <span className="font-mono text-xs text-text-2">
          {shown.length === tracks.length
            ? `${tracks.length} из ${total}`
            : `${shown.length} из ${tracks.length}`}
        </span>
      </div>

      {tracks.length === 0 ? (
        <p className="text-sm text-text-2">
          Записей пока нет. Они появятся здесь после загрузки — со вкладки
          «Справочники» или из сервиса.
        </p>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="sr-only">Поиск по названию</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, исполнитель, альбом"
              className="h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0 sm:max-w-sm"
            />
          </label>

          {shown.length === 0 ? (
            <p className="text-sm text-text-2">Ничего не нашлось.</p>
          ) : (
            <ul className="space-y-1">
              {shown.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  artists={artists}
                  albums={albums}
                  categories={categories}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TrackRow({
  track,
  artists,
  albums,
  categories,
}: {
  track: MusicAdminTrackDto;
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  categories: MusicCategoryDto[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteMusicTrack(track.id);
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить");
    } finally {
      setPending(false);
    }
  }

  const secondary = [
    track.artistName ?? "без исполнителя",
    track.albumTitle,
    formatTrackDuration(track.durationSeconds),
    formatBytes(track.sizeBytes),
    STATUS_LABELS[track.status],
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-lg px-1 py-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-text-1">
            Удалить «{track.title}» вместе с файлом? Отменить будет нечем.
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
              setConfirming(false);
              setError(null);
            }}
            className="h-9 shrink-0 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-0">
              {track.title}
            </span>
            <span className="block truncate text-xs text-text-2">
              {secondary}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setEditing((was) => !was)}
            aria-expanded={editing}
            aria-label={`Править «${track.title}»`}
            className="flex size-8 shrink-0 items-center justify-center self-center rounded-lg text-text-2 transition-colors hover:text-cyan"
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
              <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Удалить «${track.title}»`}
            className="flex size-8 shrink-0 items-center justify-center self-center rounded-lg text-text-2 transition-colors hover:text-magenta"
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

      {editing && !confirming && (
        <TrackEditForm
          track={track}
          artists={artists}
          albums={albums}
          categories={categories}
          onSaved={() => setEditing(false)}
        />
      )}

      {error && (
        <div className="mt-1.5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}

/**
 * Правка записи, уже лежащей в каталоге.
 *
 * `PATCH tracks/:id` API умел с самого начала, и очередь модерации им
 * пользовалась — но там запись правят один раз, до публикации. После неё
 * поправить название, перевесить на другого исполнителя или в другой раздел
 * было нечем: оставалось удалить и залить заново, потеряв прослушивания и
 * чужие плейлисты.
 *
 * Поля предзаполнены тем, что стоит сейчас, — для этого в DTO списка и
 * добавлены идентификаторы связей. Форма шлёт только тронутое: слать всё
 * значило бы затирать линию и разделы у каждой правки опечатки.
 */
function TrackEditForm({
  track,
  artists,
  albums,
  categories,
  onSaved,
}: {
  track: MusicAdminTrackDto;
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  categories: MusicCategoryDto[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(track.title);
  const [artistId, setArtistId] = useState(track.artistId ?? "");
  const [albumId, setAlbumId] = useState(track.albumId ?? "");
  const [categoryId, setCategoryId] = useState(track.categoryIds[0] ?? "");
  const [status, setStatus] = useState<MusicTrackStatus>(track.status);
  /** `"all"` — для всех линий; в запрос уходит `null`. */
  const [lineage, setLineage] = useState<string>(
    lineageToSelect(track.lineage),
  );
  const [isLive, setIsLive] = useState(track.isLiveRecording);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = title.trim();
  const changed =
    (trimmed !== track.title && trimmed.length > 0) ||
    artistId !== (track.artistId ?? "") ||
    albumId !== (track.albumId ?? "") ||
    categoryId !== (track.categoryIds[0] ?? "") ||
    status !== track.status ||
    lineage !== lineageToSelect(track.lineage) ||
    isLive !== track.isLiveRecording;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateMusicTrack(track.id, {
        ...(trimmed && trimmed !== track.title ? { title: trimmed } : {}),
        ...(artistId !== (track.artistId ?? "")
          ? { artistId: artistId || null }
          : {}),
        ...(albumId !== (track.albumId ?? "")
          ? { albumId: albumId || null }
          : {}),
        ...(categoryId !== (track.categoryIds[0] ?? "")
          ? { categoryIds: categoryId ? [categoryId] : [] }
          : {}),
        ...(status !== track.status ? { status } : {}),
        ...(lineage !== lineageToSelect(track.lineage)
          ? { lineage: lineageFromSelect(lineage) }
          : {}),
        ...(isLive !== track.isLiveRecording
          ? { isLiveRecording: isLive }
          : {}),
      });
      onSaved();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-glass-brd bg-bg-1/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-text-2">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
          <select
            value={artistId}
            onChange={(event) => setArtistId(event.target.value)}
            className={field}
          >
            <option value="">Не указан</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Программа или альбом
          </span>
          <select
            value={albumId}
            onChange={(event) => setAlbumId(event.target.value)}
            className={field}
          >
            <option value="">Не указан</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Раздел</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={field}
          >
            <option value="">Не указан</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Статус</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as MusicTrackStatus)
            }
            className={field}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* Линию при заливке ставит не редактор, а профиль загрузившего —
            поэтому её чаще всего и приходится исправлять здесь. */}
        <LineageSelect
          value={lineage}
          onChange={setLineage}
          allLabel="Для всех линий"
          label="Духовная линия"
          className={field}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
        <input
          type="checkbox"
          checked={isLive}
          onChange={(event) => setIsLive(event.target.checked)}
        />
        Запись с программы
      </label>

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !changed}
          className="h-9 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-cyan disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onSaved}
          className="h-9 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
