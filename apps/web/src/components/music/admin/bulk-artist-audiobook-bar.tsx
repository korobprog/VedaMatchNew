"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setMusicArtistsAudiobook } from "@/lib/music-admin-client-api";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";

const artistsWord = (n: number) =>
  plural(n, "исполнитель", "исполнителя", "исполнителей");

/**
 * Панель массовой отметки «это аудиокниги» (VED-237).
 *
 * Рядом с массовой простановкой корневой категории и тем же приёмом:
 * редакция размечает чтеца один раз — и все его записи, включая будущие,
 * уходят в раздел «Аудиокниги» и пропадают из общего каталога. Обратное
 * действие — той же панелью: ошибочно отмеченного возвращают в Медиатеку
 * одним нажатием, а не по одной записи.
 */
export function MusicBulkArtistAudiobookBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const count = selectedIds.length;

  async function apply(isAudiobook: boolean) {
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const result = await setMusicArtistsAudiobook({
        artistIds: selectedIds,
        isAudiobook,
      });
      const what = `${result.updated} ${artistsWord(result.updated)}`;
      setDone(
        isAudiobook
          ? `${what} — записи ушли из Медиатеки. Соберите их в книги во вкладке «Аудиокниги».`
          : `${what} — записи вернулись в Медиатеку.`,
      );
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
      aria-label="Раздел «Аудиокниги» для выбранных исполнителей"
      className="mb-3 rounded-xl border border-glass-brd bg-bg-1/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-text-0">
          Выбрано: {count} {artistsWord(count)}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void apply(true)}
          className="h-9 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Отметить чтецами"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void apply(false)}
          className="h-9 rounded-lg border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Вернуть в Медиатеку
        </button>
      </div>

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
