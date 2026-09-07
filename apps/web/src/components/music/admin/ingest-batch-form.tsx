"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MusicAlbumDto,
  MusicArtistDto,
  MusicCategoryDto,
  MusicIngestBatchDetailDto,
  MusicUploadRightsBasis,
  UpdateMusicIngestBatchRequest,
} from "@vedamatch/shared";
import {
  deleteIngestBatch,
  publishIngestBatch,
  retryIngest,
  startIngestBatch,
  updateIngestBatch,
} from "@/lib/music-admin-client-api";
import { formatBytes } from "@/lib/music-duration";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";
import {
  LineageSelect,
  lineageFromSelect,
  lineageToSelect,
} from "@/components/lineage-picker";

const BASES: { value: MusicUploadRightsBasis; label: string }[] = [
  { value: "own_recording", label: "Своя запись" },
  { value: "open_program", label: "Запись с открытой программы" },
  { value: "freely_distributed", label: "Свободно распространяемая" },
];

const field =
  "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

/**
 * Шапка партии: общие поля всех её записей и кнопки над ней.
 *
 * Сохраняется по уходу с поля, без кнопки «ОК»: у партии таких полей восемь,
 * и заставлять подтверждать каждое — это восемь лишних нажатий на каждую
 * загрузку. Ошибку показываем тут же, рядом с формой: молчаливо потерянная
 * правка хуже отказа.
 */
export function IngestBatchForm({
  batch,
  artists,
  albums,
  categories,
}: {
  batch: MusicIngestBatchDetailDto;
  artists: MusicArtistDto[];
  albums: MusicAlbumDto[];
  categories: MusicCategoryDto[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const published = batch.status === "published";
  /**
   * Позиции, которые ещё в работе. Пока они есть, публиковать нельзя: партия
   * закроется, а доехавший следом остаток опубликовать будет уже нечем.
   * Считаем по позициям, а не по `batch.status`: он пересчитывается тиком и
   * на экране успевает устареть.
   */
  const inFlight = batch.items.filter(
    (item) => item.status === "waiting" || item.status === "fetching",
  ).length;

  async function patch(body: UpdateMusicIngestBatchRequest): Promise<void> {
    setError(null);
    try {
      await updateIngestBatch(batch.id, body);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    }
  }

  async function run(
    action: () => Promise<string>,
  ): Promise<void> {
    setPending(true);
    setError(null);
    setNote(null);
    try {
      setNote(await action());
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выполнить");
    } finally {
      setPending(false);
    }
  }

  function toggleCategory(id: string, on: boolean): void {
    const next = on
      ? [...batch.categoryIds, id]
      : batch.categoryIds.filter((value) => value !== id);
    void patch({ categoryIds: next });
  }

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-text-0">
          Общее для всей партии
        </h2>
        <span className="font-mono text-xs text-text-2">
          {formatBytes(batch.sizeBytes)} из {formatBytes(batch.quotaBytes)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Название партии</span>
          <input
            defaultValue={batch.title}
            disabled={published}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== batch.title) void patch({ title: value });
            }}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Основание прав</span>
          <select
            value={batch.rightsBasis}
            disabled={published}
            onChange={(event) =>
              void patch({
                rightsBasis: event.target.value as MusicUploadRightsBasis,
              })
            }
            className={field}
          >
            {BASES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">Исполнитель</span>
          <select
            value={batch.artistId ?? ""}
            disabled={published}
            onChange={(event) =>
              void patch({ artistId: event.target.value || null })
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
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Программа или альбом
          </span>
          <select
            value={batch.albumId ?? ""}
            disabled={published}
            onChange={(event) =>
              void patch({ albumId: event.target.value || null })
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
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Язык — `ru`, `en`, `sa`
          </span>
          <input
            defaultValue={batch.language ?? ""}
            disabled={published}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== (batch.language ?? "")) {
                void patch({ language: value || null });
              }
            }}
            className={field}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-2">
            Откуда взяли — основание словами
          </span>
          <input
            defaultValue={batch.rightsNote ?? ""}
            disabled={published}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== (batch.rightsNote ?? "")) {
                void patch({ rightsNote: value || null });
              }
            }}
            className={field}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-text-2">Разделы каталога</legend>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <span className="text-sm text-text-2">
              Разделов пока нет — заведите их во вкладке «Справочники».
            </span>
          ) : (
            categories.map((category) => {
              const on = batch.categoryIds.includes(category.id);
              return (
                <label
                  key={category.id}
                  className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${
                    on
                      ? "border-violet/40 bg-violet/15 text-text-0"
                      : "border-glass-brd text-text-1"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={published}
                    onChange={(event) =>
                      toggleCategory(category.id, event.target.checked)
                    }
                    className="size-4"
                  />
                  {category.title}
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          defaultChecked={batch.isLiveRecording}
          disabled={published}
          onChange={(event) =>
            void patch({ isLiveRecording: event.target.checked })
          }
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="flex flex-col">
          <span className="text-sm text-text-0">Запись с программы</span>
          <span className="text-xs text-text-2">
            Значок на карточке: слушатель сразу понимает, что это живой звук, а
            не студия.
          </span>
        </span>
      </label>

      <div className="max-w-md">
        <LineageSelect
          value={lineageToSelect(batch.lineage)}
          onChange={(next) => void patch({ lineage: lineageFromSelect(next) })}
          allLabel="Для всех линий"
          label="Духовная линия записей"
          hint="Преданные слышат в каталоге записи своей линии и «для всех». По умолчанию «для всех» — линию ставьте, когда записи партии действительно принадлежат ей: иначе они пропадут из каталога у остальных линий."
          disabled={published}
          className={field}
        />
      </div>

      {note && <Alert tone="success">{note}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        {/* Полем рядом с кнопкой, а не окном после неё: решение про подборку
            принимается до публикации, а модалка ради одной строки вынуждает
            подтверждать то, что человек чаще всего оставляет пустым. */}
        <label className="block w-full sm:w-64">
          <span className="mb-1 block text-xs text-text-2">
            Подборка из партии — необязательно
          </span>
          <input
            value={playlistTitle}
            disabled={published}
            onChange={(event) => setPlaylistTitle(event.target.value)}
            placeholder="Киртаны с фестиваля"
            className={field}
          />
        </label>
        <button
          type="button"
          disabled={
            pending || published || inFlight > 0 || batch.storedCount === 0
          }
          // Подсказка на самой кнопке: неактивная кнопка без объяснения
          // выглядит поломкой, а не запретом.
          title={
            inFlight > 0
              ? `Приём ещё идёт: ${inFlight} ${plural(inFlight, "позиция", "позиции", "позиций")} в работе`
              : undefined
          }
          onClick={() =>
            void run(async () => {
              const title = playlistTitle.trim();
              const result = await publishIngestBatch(
                batch.id,
                title || undefined,
              );
              return result.playlistId
                ? `Ушло в каталог: ${result.published}. Подборка «${title}» собрана и видна на витрине.`
                : `Ушло в каталог: ${result.published}.`;
            })
          }
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          Опубликовать всё
        </button>
        <button
          type="button"
          disabled={pending || published}
          onClick={() =>
            void run(async () => {
              const result = await startIngestBatch(batch.id);
              return `В очереди: ${result.queued}.`;
            })
          }
          className="h-9 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          Запустить приём
        </button>
        <button
          type="button"
          disabled={pending || published || batch.failedCount === 0}
          onClick={() =>
            void run(async () => {
              const result = await retryIngest(batch.id);
              return `Повторим: ${result.retried}.`;
            })
          }
          className="h-9 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          Повторить упавшие
        </button>

        {/* Удаление в два нажатия и без `confirm()` — тем же приёмом, что в
            справочниках: системное окно не переживает тему портала и не
            объясняет, что именно исчезнет. */}
        {confirmingDelete ? (
          <>
            <span className="text-sm text-text-1">
              Удалить партию вместе с файлами и черновиками?
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void (async () => {
                  setPending(true);
                  try {
                    await deleteIngestBatch(batch.id);
                    router.push("/admin/music/ingest");
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Не удалось удалить",
                    );
                    setPending(false);
                  }
                })()
              }
              className="h-9 rounded-xl border border-magenta/50 px-4 text-sm font-semibold text-text-0 disabled:opacity-50"
            >
              Удалить
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="h-9 rounded-xl px-3 text-sm text-text-2 hover:text-text-0"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingDelete(true)}
            className="h-9 rounded-xl px-3 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
          >
            Удалить партию
          </button>
        )}
      </div>

      {!published && inFlight > 0 && (
        <p className="text-sm text-text-1">
          Приём ещё идёт: {inFlight}{" "}
          {plural(inFlight, "позиция", "позиции", "позиций")} в работе.
          «Опубликовать всё» включится, когда они доедут: опубликованная
          партия закрывается, и остаток в неё уже не попадёт.
        </p>
      )}

      {published && (
        <p className="text-sm text-text-1">
          Партия опубликована — её записи уже в каталоге. Править их теперь
          можно во вкладке «Справочники».
        </p>
      )}
    </section>
  );
}
