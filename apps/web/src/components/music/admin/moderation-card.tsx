"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MusicArtistDto,
  MusicCategoryDto,
  MusicModerationItemDto,
  MusicUploadRightsBasis,
  LineageId,
} from "@vedamatch/shared";
import { API_URL } from "@/lib/http-client";
import { decideMusicTrack, updateMusicTrack } from "@/lib/music-admin-client-api";
import { formatBytes, formatTrackDuration } from "@/lib/music-duration";
import { MusicCoverField } from "@/components/music/cover-field";
import { Alert } from "@/components/ui/alert";
import { LineageSelect } from "@/components/lineage-picker";

const RIGHTS_LABELS: Record<MusicUploadRightsBasis, string> = {
  own_recording: "Своя запись",
  open_program: "Запись с открытой программы",
  freely_distributed: "Свободно распространяемая",
};

/**
 * Карточка записи в очереди модерации.
 *
 * Порядок действий не случаен: сначала послушать, потом привязать
 * исполнителя и раздел, и только потом решать. Кнопка «Опубликовать» стоит
 * после полей именно поэтому — опубликованная запись без исполнителя и
 * категории не находится ни фильтром, ни поиском, и чинить её приходится
 * задним числом.
 */
export function MusicModerationCard({
  item,
  artists,
  categories,
}: {
  item: MusicModerationItemDto;
  artists: MusicArtistDto[];
  categories: MusicCategoryDto[];
}) {
  const router = useRouter();
  const { track } = item;

  const [artistId, setArtistId] = useState(track.artist?.id ?? "");
  const [categoryId, setCategoryId] = useState(track.categories[0]?.id ?? "");
  const [title, setTitle] = useState(track.title);
  const [isLive, setIsLive] = useState(track.isLiveRecording);
  /** Пустая строка — для всех линий. */
  const [lineage, setLineage] = useState<string>(track.lineage ?? "");
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "publish" | "reject") {
    setPending(true);
    setError(null);
    try {
      if (decision === "publish") {
        // Правки уходят до решения: публикация — последний шаг, и запись
        // должна попасть в каталог уже разобранной.
        await updateMusicTrack(track.id, {
          title: title.trim() || track.title,
          artistId: artistId || null,
          categoryIds: categoryId ? [categoryId] : [],
          isLiveRecording: isLive,
          lineage: lineage ? (lineage as LineageId) : null,
          // Только когда обложку выбрали: `null` здесь означал бы «снять», а
          // модератор её просто не трогал.
          ...(coverKey ? { coverKey } : {}),
        });
      }
      await decideMusicTrack(track.id, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
      setPending(false);
    }
  }

  const field =
    "h-9 w-full rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0";

  return (
    <li className="glass rounded-2xl border border-glass-brd p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-gold/40 px-2 py-0.5 text-gold">
          Ждёт проверки
        </span>
        {item.rightsBasis && (
          <span className="rounded-full border border-glass-brd px-2 py-0.5 text-text-1">
            {RIGHTS_LABELS[item.rightsBasis]}
          </span>
        )}
        <span className="text-text-2">
          {formatTrackDuration(track.durationSeconds)}
          {track.bitrateKbps ? ` · ${track.bitrateKbps} kbps` : ""}
          {` · ${formatBytes(track.sizeBytes)}`}
        </span>
        {item.uploader && (
          <span className="text-text-2">Залил: {item.uploader.name}</span>
        )}
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-text-2">Название</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={field}
        />
      </label>

      {/* Нативный <audio>: модератору нужно послушать, а не любоваться
          плеером. Ссылка подписанная и живёт шесть часов. */}
      <audio
        controls
        preload="none"
        src={`${API_URL}/music/tracks/${track.id}/stream`}
        className="mt-3 w-full"
      >
        Ваш браузер не умеет проигрывать этот файл.
      </audio>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

        {/* Линия предзаполнена линией загрузившего (или ISKCON): модератор
            сверяет, а не угадывает. */}
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

      <div className="mt-3">
        <MusicCoverField
          scope="track"
          value={coverKey}
          onChange={setCoverKey}
          label="Обложка записи"
        />
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-text-2">
          Причина решения — обязательна при отказе
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Например: запись чужого концерта без разрешения"
          className={field}
        />
      </label>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void decide("publish")}
          className="btn-mint h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
        >
          Опубликовать
        </button>
        <button
          type="button"
          disabled={pending || !note.trim()}
          onClick={() => void decide("reject")}
          className="h-9 rounded-xl border border-magenta/50 px-4 text-sm font-semibold text-magenta disabled:opacity-40"
        >
          Отклонить
        </button>
      </div>
    </li>
  );
}
